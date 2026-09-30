import { redactSecrets } from "../utils/redactSecrets";
import type { ProviderRegistry } from "./registry";
import { NO_DEADLINE } from "./types";
import type {
  FetchDeadline,
  IntegrationConfig,
  IntegrationConfigRow,
  ProviderResult,
} from "./types";

// What one (slug, vendor) sync attempt writes to sync_status. `runAt` is the
// timestamp every row from this run shares, so the orchestrator's own clock
// (not each write's individual commit time) is what "last_run_at" records.
export interface SyncStatusWrite {
  slug: string;
  vendor: string;
  runAt: Date;
  ok: boolean;
  error: string | null;
}

export interface SyncOutcome {
  slug: string;
  vendor: string;
  ok: boolean;
  error?: string;
}

export interface SyncSkippedRow {
  slug: string;
  vendor: string;
}

export interface SyncSummary {
  outcomes: SyncOutcome[];
  // Enabled rows the run budget cut off before they were ever attempted —
  // distinct from a `SyncOutcome` with ok:false, which means the row *was*
  // attempted and failed. Never silently dropped: a non-empty array here
  // means this run did less work than there was to do, and callers
  // (server/api/sync.post.ts's HTTP response, netlify/functions/
  // scheduled-sync.ts's invocation log) should be able to tell the
  // difference from "everything enabled got synced."
  skipped: SyncSkippedRow[];
}

// Everything the orchestration loop needs, injected rather than imported
// directly — the loop itself never touches the DB, a provider's network
// client, or the clock, so it's unit-testable with plain fakes (see
// tests/server/integrations/orchestrator.test.ts) and the real wiring
// (server/integrations/persist.ts + config.ts + the provider registry) has
// exactly one call site, server/api/sync.post.ts.
export interface SyncOrchestratorDeps {
  listEnabledConfigRows: () => Promise<IntegrationConfigRow[]>;
  resolveConfig: (row: IntegrationConfigRow) => IntegrationConfig;
  registry: Pick<ProviderRegistry, "get">;
  persistProviderResult: (
    row: IntegrationConfigRow,
    result: ProviderResult,
  ) => Promise<unknown>;
  recordSyncStatus: (status: SyncStatusWrite) => Promise<unknown>;
  now?: () => Date;
  // Wall-clock budget (ms) runSync's own batching loop may spend admitting
  // new batches — see BATCH_SIZE/DEFAULT_RUN_BUDGET_MS below for why this
  // exists and how it's applied. Overridable per-call (tests use this to
  // force the skip path deterministically); production wiring
  // (syncDeps.ts) leaves it unset and gets DEFAULT_RUN_BUDGET_MS.
  runBudgetMs?: number;
  // Monotonic millisecond clock the budget above is measured against —
  // separate from `now` (which stamps `runAt`/sync_status and can be a
  // fixed value in tests) because this one must actually advance and never
  // step backward. Defaults to performance.now() (unlike Date.now(), not
  // subject to wall-clock/NTP adjustments, which could otherwise make the
  // budget check never trip on a backward step, or end the run early on a
  // forward one); tests inject a counter instead of spying on the global.
  monotonicNow?: () => number;
}

// How many (slug, vendor) rows run concurrently within one batch. Bounds
// per-batch resource contention (DB connections, outbound sockets) so a
// growing enabled-row count doesn't itself inflate one batch's latency —
// deliberately a small fixed number, not scaled to row count (issue #51:
// "don't over-engineer a full queueing system for the current provider
// count").
const BATCH_SIZE = 5;

// Ceiling on how long runSync's batching loop may keep *admitting new
// batches*, in ms — it does not bound how long an already-admitted batch
// takes to finish. Netlify's default synchronous Function execution limit
// is ~10s (see netlify/functions/scheduled-sync.ts's FETCH_TIMEOUT_MS
// comment); this sits below that function's own 9s client-side abort so
// /api/sync stops starting new work with room to spare, rather than either
// racing the platform's hard kill or the caller's own timeout. On its own
// this would NOT bound a single provider's own request timeout (each vendor
// client sets its own, e.g. STRIPE_REQUEST_TIMEOUT_MS/GA4_REQUEST_TIMEOUT_MS
// at 20s) — a row that hangs its full 20s could still push a run past this
// ceiling on its own, batch count aside. createRunDeadline below closes that
// gap: the same runBudgetMs also bounds every admitted row's own
// provider.fetch call via a shared FetchDeadline (see issue #62), not just
// which batches this loop starts.
const DEFAULT_RUN_BUDGET_MS = 7_000;

// Node's setTimeout silently coerces any delay above this (~24.8 days) down
// to 1ms instead of throwing or clamping to its own max — the same
// "instantly-expired deadline fails every row" failure createRunDeadline's
// non-finite guard below exists to prevent, just reachable through a
// same-order-of-magnitude finite number instead of NaN/Infinity. Unreachable
// via DEFAULT_RUN_BUDGET_MS, but deps.runBudgetMs is an injectable override
// (see SyncOrchestratorDeps's comment), so nothing stops a caller from
// passing one this large.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

// Builds the FetchDeadline every row admitted in this runSync call shares
// (see types.ts's FetchDeadline for what each field is for and why). One
// deadline per run, built once here and threaded into every
// syncOneIntegration call regardless of which batch admits its row — a row
// admitted late in the run gets exactly as little time left as a slow
// earlier row already spent, rather than its own fresh full timeout budget.
//
// Deliberately built from the real wall clock (Date.now()/setTimeout), not
// the injectable monotonicNow/now deps runSync itself takes — those exist
// so the *batch admission* loop above is deterministically testable without
// real timers, but this deadline's own timer must actually fire in real
// time for a hung provider's fetch to actually abort, so it stays
// independent of either mock.
function createRunDeadline(budgetMs: number): FetchDeadline & {
  dispose: () => void;
} {
  // A non-finite budget (NaN, Infinity — never expected from
  // DEFAULT_RUN_BUDGET_MS or a sane deps.runBudgetMs override) means "no
  // effective bound" here, not "expire almost immediately": Math.max(0, NaN)
  // is itself NaN, and Node's setTimeout coerces a NaN/negative delay to
  // ~1ms, which would fail every row in the run rather than just softly
  // falling back to unbounded. A finite budget above MAX_TIMER_DELAY_MS gets
  // the same treatment, for the same reason (see that constant's comment).
  // NO_DEADLINE's own signal never aborts, so `dispose` here is a no-op
  // (there's no timer to clear).
  if (!Number.isFinite(budgetMs) || budgetMs > MAX_TIMER_DELAY_MS) {
    return { ...NO_DEADLINE, dispose: () => {} };
  }

  const boundedBudgetMs = Math.max(0, budgetMs);
  const deadlineAt = Date.now() + boundedBudgetMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () =>
      controller.abort(
        // A real AbortError DOMException (not a plain Error) — so every
        // consumer that recognizes a timeout via `error.name === "AbortError"`
        // (syndication/httpClient.ts's isAbortError, and any future client
        // written the same way) still recognizes THIS abort as a timeout too,
        // not a generic failure — sentryClient.ts additionally distinguishes
        // it from its own per-request timeout via `deadline.signal.aborted`,
        // which doesn't depend on the reason's shape at all.
        new DOMException(
          `Shared run budget of ${boundedBudgetMs}ms exhausted.`,
          "AbortError",
        ),
      ),
    boundedBudgetMs,
  );
  return {
    signal: controller.signal,
    remainingMs: () => Math.max(0, deadlineAt - Date.now()),
    dispose: () => clearTimeout(timeoutId),
  };
}

// `size` has exactly one call site below, passing the module constant
// BATCH_SIZE (always >= 1) — no size < 1 guard, since that branch could
// never fire and would be untestable without exporting this function.
function chunk<Row>(rows: Row[], size: number): Row[][] {
  const batches: Row[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    batches.push(rows.slice(start, start + size));
  }
  return batches;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// Bounds ANY provider.fetch call to the shared deadline — even one whose
// underlying vendor client doesn't itself watch `deadline` at all (e.g.
// clerkProvider: `deadline` is optional on IntegrationProvider precisely so
// a provider with no timeout/AbortSignal seam to adapt yet, per its own
// comment in types.ts, can still ignore it and keep working). Without this,
// the orchestrator's whole "an individual provider's fetch can't exceed the
// overall run budget" guarantee (issue #62) would only hold for providers
// that opt in, not for every provider registered today or in the future.
//
// This can't cancel the underlying call — JS has no way to force that from
// the outside once it's already in flight — it only stops THIS row from
// holding up the rest of the run past the deadline.
//
// `createResultPromise` is a thunk, not a plain Promise, specifically so the
// aborted-check below can run BEFORE the real call starts: a row admitted
// into a batch right as the shared budget expires would otherwise still
// fire its provider.fetch (a real, possibly rate-limited vendor request —
// see MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC's monthly-cap comment for how
// costly that can be) only to have the result immediately discarded.
function raceAgainstDeadline<Result>(
  identity: { slug: string; vendor: string },
  createResultPromise: () => Promise<Result>,
  deadline: FetchDeadline,
): Promise<Result> {
  if (deadline.signal.aborted) {
    return Promise.reject(deadline.signal.reason);
  }

  const resultPromise = createResultPromise();
  // The loser's eventual settlement is never left as an unhandled
  // rejection — nothing further awaits it once the race below is decided —
  // but silently discarding it would hide a real vendor error (e.g. an
  // auth failure) that happens to arrive just after the deadline, behind
  // what sync_status would otherwise record as merely "ran out of time."
  // Only log when the deadline has ALREADY aborted by the time this
  // settles: a resultPromise that wins the race by rejecting first hits
  // this same handler while `deadline.signal.aborted` is still false, and
  // is already logged once by syncOneIntegration's own catch — logging it
  // here too would double-report the identical cause.
  resultPromise.catch((cause) => {
    if (deadline.signal.aborted) {
      console.warn(
        `Provider fetch for ${identity.slug}:${identity.vendor} settled after the shared run budget was already exhausted`,
        cause,
      );
    }
  });

  // Removed once the race settles either way — without this, a provider
  // that wins the race (finishes before the deadline fires) leaves its
  // "abort" listener attached to deadline.signal forever. That's a
  // non-issue for the real per-run AbortController (it's GC'd with the run),
  // but a non-finite runBudgetMs makes createRunDeadline hand out the
  // module-level NO_DEADLINE/NEVER_ABORTS signal instead, which lives for
  // the life of a warm function instance — every sync run would otherwise
  // pile one more permanently-dangling listener onto it.
  let onAbort: (() => void) | undefined;
  return Promise.race([
    resultPromise,
    new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(deadline.signal.reason);
      deadline.signal.addEventListener("abort", onAbort, { once: true });
    }),
  ]).finally(() => {
    if (onAbort) {
      deadline.signal.removeEventListener("abort", onAbort);
    }
  });
}

// Best-effort: the outcome syncOneIntegration is about to return (success or
// failure) is already decided by the time this runs, so a failure recording
// it to sync_status must never change that outcome — it's logged
// (server-side only, so the unredacted cause is fine here) and swallowed
// rather than re-thrown. This is also what keeps syncOneIntegration itself
// from ever rejecting (see runSync's use of a plain Promise.all below).
async function recordSyncStatusBestEffort(
  deps: SyncOrchestratorDeps,
  status: SyncStatusWrite,
): Promise<void> {
  try {
    await deps.recordSyncStatus(status);
  } catch (writeCause) {
    console.error(
      `Failed to write sync_status for ${status.slug}:${status.vendor}`,
      writeCause,
    );
  }
}

// One (slug, vendor) row's full attempt: resolve its config, fetch from its
// provider, and persist what came back. Every failure mode in that
// path — an unresolvable secret, no registered provider, or the provider's
// fetch/persist throwing — is caught below, so it becomes a `sync_status`
// failure row for this vendor alone, never an exception that would stop the
// rest of the run.
//
// The error is logged to console.error as-is (`cause.message` or
// `String(cause)`) — that's server-side only, so the unredacted cause is
// fine there. Both `sync_status.error` and the `SyncOutcome` returned below
// are different: the former is a persisted, later-read column, and the
// latter is `runSync`'s return value, which server/api/sync.post.ts hands
// straight back as an HTTP response body — so the same raw message reaches
// a caller either way. Both are built from one redacted message (via
// redactSecrets(), see server/utils/redactSecrets.ts), which also takes the
// config's own resolved secret (when one was resolved) as an exact-match
// fallback for whatever the pattern list doesn't cover.
async function syncOneIntegration(
  row: IntegrationConfigRow,
  deps: SyncOrchestratorDeps,
  runAt: Date,
  deadline: FetchDeadline,
): Promise<SyncOutcome> {
  const identity = { slug: row.slug, vendor: row.vendor };
  let resolvedConfig: IntegrationConfig | undefined;

  try {
    const provider = deps.registry.get(row.vendor);
    if (!provider) {
      throw new Error(`No provider registered for vendor "${row.vendor}".`);
    }
    resolvedConfig = deps.resolveConfig(row);
    const config = resolvedConfig;
    const result = await raceAgainstDeadline(
      identity,
      () => provider.fetch(config, deadline),
      deadline,
    );
    await deps.persistProviderResult(row, result);
  } catch (cause) {
    console.error(`Sync failed for ${row.slug}:${row.vendor}`, cause);
    const redactedMessage = redactSecrets(
      errorMessage(cause),
      resolvedConfig?.secret ?? undefined,
    );
    await recordSyncStatusBestEffort(deps, {
      ...identity,
      runAt,
      ok: false,
      error: redactedMessage,
    });
    return { ...identity, ok: false, error: redactedMessage };
  }

  // The fetch + persist above already succeeded — the data is durable —
  // so recording that fact goes through recordSyncStatusBestEffort too: a
  // transient failure to write sync_status must not turn an actually
  // successful vendor sync into a reported failure.
  await recordSyncStatusBestEffort(deps, {
    ...identity,
    runAt,
    ok: true,
    error: null,
  });
  return { ...identity, ok: true };
}

// The orchestration loop: every enabled integration_config row is synced
// independently, in fixed-size concurrent batches (BATCH_SIZE), sharing one
// `runAt` so every row from this run records the same last_run_at. Within a
// batch, a plain Promise.all (not Promise.allSettled) is safe:
// syncOneIntegration never rejects, per recordSyncStatusBestEffort's comment
// above.
//
// Between batches, the loop checks DEFAULT_RUN_BUDGET_MS (or the deps
// override): once the budget is spent, remaining rows are left unattempted
// for *this* run rather than started, and reported back in
// SyncSummary.skipped rather than silently vanishing from the response.
// That's deliberately not tracked as a `SyncOutcome` failure —
// listEnabledIntegrationConfigs (server/integrations/persist.ts) orders
// rows oldest-synced-first, so an unattempted row is both eligible for and
// favored by the very next scheduled invocation (every 15 minutes; see
// netlify/functions/scheduled-sync.ts), rotating which rows a routinely-hit
// budget leaves behind rather than starving the same tail forever, with no
// deferred-work state needed here. This rotation guarantee has two known
// gaps, both stemming from ordering on a value (last_run_at) that's only
// ever advanced *after* an attempt completes: (1) a row whose provider
// hangs long enough for Netlify to kill the whole /api/sync invocation
// never reaches recordSyncStatusBestEffort at all, and (2) a row whose
// sync_status upsert itself keeps failing never advances last_run_at either
// (recordSyncStatusBestEffort swallows write failures by design — see its
// own comment). Either way the row's last_run_at is never advanced, so it
// re-occupies the same always-admitted first-batch slot on every subsequent
// run — with enough such rows (BATCH_SIZE), no other enabled row is ever
// synced again, while the response still reports a routine `skipped`
// warning with no signal distinguishing this from healthy rotation.
// Stamping an attempt timestamp before provider.fetch (rather than only
// recording the outcome after) would close both; out of scope here — see
// this PR's follow-up suggestions.
//
// The very first batch is ALWAYS admitted regardless of elapsed time (the
// budget check below is skipped while admittedRowCount is still 0) —
// otherwise a slow listEnabledConfigRows() call alone (a Neon cold start,
// pool contention) could exhaust the whole budget before any row is ever
// attempted, and every subsequent invocation would repeat that same
// zero-progress outcome forever. Guaranteeing forward progress matters more
// than strictly enforcing the ceiling on that first batch.
//
// This bounds how long runSync's own loop spends *admitting* work
// regardless of how many providers are enabled; see DEFAULT_RUN_BUDGET_MS's
// comment for what it does not bound.
export async function runSync(
  deps: SyncOrchestratorDeps,
): Promise<SyncSummary> {
  const monotonicNow = deps.monotonicNow ?? (() => performance.now());
  const startedAt = monotonicNow();

  const rows = await deps.listEnabledConfigRows();
  const runAt = (deps.now ?? (() => new Date()))();
  const runBudgetMs = deps.runBudgetMs ?? DEFAULT_RUN_BUDGET_MS;
  // Deliberately a fresh runBudgetMs measured from HERE, not
  // `runBudgetMs - (monotonicNow() - startedAt)` (what's left after
  // listEnabledConfigRows() above) — that would let a slow DB call (a Neon
  // cold start, pool contention) hand the always-admitted first batch (see
  // that same guarantee below) a deadline that's already expired before a
  // single provider.fetch even runs, silently turning "guaranteed forward
  // progress" into a batch of instant, budget-exhausted failures. A few
  // hundred ms of drift between this deadline's window and the
  // batch-admission loop's own elapsed-since-startedAt accounting is the
  // trade-off, in the same direction as that loop's own existing bias
  // (forward progress over strictly enforcing the ceiling) — not a new one.
  // Also keeps this deadline building on Date.now() alone, independent of
  // the mockable monotonicNow the batch-admission loop below uses (see
  // createRunDeadline's own comment for why ITS timer needs a real clock).
  const runDeadline = createRunDeadline(runBudgetMs);

  const outcomes: SyncOutcome[] = [];
  const batches = chunk(rows, BATCH_SIZE);
  let admittedRowCount = 0;

  try {
    for (const batch of batches) {
      const isFirstBatch = admittedRowCount === 0;
      const budgetSpent = monotonicNow() - startedAt >= runBudgetMs;
      if (!isFirstBatch && budgetSpent) {
        break;
      }
      const batchOutcomes = await Promise.all(
        batch.map((row) => syncOneIntegration(row, deps, runAt, runDeadline)),
      );
      outcomes.push(...batchOutcomes);
      admittedRowCount += batch.length;
    }
  } finally {
    runDeadline.dispose();
  }

  const skipped: SyncSkippedRow[] = rows
    .slice(admittedRowCount)
    .map(({ slug, vendor }) => ({ slug, vendor }));
  if (skipped.length > 0) {
    console.warn(
      `runSync: budget (${runBudgetMs}ms) spent; ${skipped.length} of ${rows.length} enabled row(s) left unattempted this run`,
    );
  }

  return { outcomes, skipped };
}
