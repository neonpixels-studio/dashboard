import { redactSecrets } from "../utils/redactSecrets";
import type { ProviderRegistry } from "./registry";
import type {
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

// What one (slug, vendor) sync attempt stamps to integration_config
// *before* provider.fetch runs (see persist.ts's recordConfigSyncAttempt and
// schema.ts's comment on integration_config.last_attempt_at for why this is
// a separate column/table from SyncStatusWrite's sync_status, not just a
// narrower version of it). Deliberately no ok/error: this is a marker that
// an attempt started, not a report of how it went, so it must never carry a
// result the attempt hasn't reached yet.
export interface SyncAttemptWrite {
  slug: string;
  vendor: string;
  runAt: Date;
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
  // Stamps integration_config.last_attempt_at before provider.fetch is even
  // called — see syncOneIntegration's use of it and SyncAttemptWrite's own
  // comment for why this writes to a different table than recordSyncStatus.
  recordConfigSyncAttempt: (attempt: SyncAttemptWrite) => Promise<unknown>;
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
// racing the platform's hard kill or the caller's own timeout. It does NOT
// bound a single provider's own request timeout (each vendor client sets
// its own, e.g. STRIPE_REQUEST_TIMEOUT_MS/GA4_REQUEST_TIMEOUT_MS at 20s) —
// a row that hangs its full 20s can still push a run past this ceiling on
// its own, batch count aside. Threading a shared deadline into
// provider.fetch would close that gap; out of scope here (issue #51 is
// specifically about fan-out growing with provider *count*, not any one
// provider's own latency) — see this PR's follow-up suggestions.
const DEFAULT_RUN_BUDGET_MS = 7_000;

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

// Runs a DB write best-effort (the pre-fetch attempt stamp on
// integration_config, or a post-fetch outcome write to sync_status):
// whatever syncOneIntegration is about to do next (attempt a fetch, or
// return an outcome already decided) must never be changed by a write
// failure here — it's logged (server-side only, so the unredacted cause is
// fine) and swallowed rather than re-thrown. This is also what keeps
// syncOneIntegration itself from ever rejecting (see runSync's use of a
// plain Promise.all below).
async function writeBestEffort(
  write: () => Promise<unknown>,
  failureMessage: string,
): Promise<void> {
  try {
    await write();
  } catch (writeCause) {
    console.error(failureMessage, writeCause);
  }
}

// The two outcome writes below (success and failure) share this one
// best-effort wrapper so the "Failed to write sync_status for slug:vendor"
// message is built in exactly one place rather than duplicated at each call
// site.
async function recordOutcomeBestEffort(
  deps: SyncOrchestratorDeps,
  status: SyncStatusWrite,
): Promise<void> {
  await writeBestEffort(
    () => deps.recordSyncStatus(status),
    `Failed to write sync_status for ${status.slug}:${status.vendor}`,
  );
}

// Mirrors recordOutcomeBestEffort above for the pre-fetch attempt stamp —
// its own best-effort wrapper, so the "Failed to record sync attempt for
// slug:vendor" message also lives in exactly one place.
async function recordAttemptBestEffort(
  deps: SyncOrchestratorDeps,
  attempt: SyncAttemptWrite,
): Promise<void> {
  await writeBestEffort(
    () => deps.recordConfigSyncAttempt(attempt),
    `Failed to record sync attempt for ${attempt.slug}:${attempt.vendor}`,
  );
}

// One (slug, vendor) row's full attempt: stamp that an attempt started,
// resolve its config, fetch from its provider, and persist what came back.
// Every failure mode in the fetch/persist path — an unresolvable secret, no
// registered provider, or the provider's fetch/persist throwing — is caught
// below, so it becomes a `sync_status` failure row for this vendor alone,
// never an exception that would stop the rest of the run.
//
// The attempt stamp (deps.recordConfigSyncAttempt) runs and is awaited *before*
// provider.fetch — not folded into the try block below — so it lands
// whether or not the fetch itself ever returns. That's the fix for the
// rotation-guarantee gap where a row's ordering key was only ever advanced
// after the fact, so a hung fetch (whole invocation killed) or a
// sync_status outcome write that keeps failing left it frozen. Writing the
// attempt to integration_config.last_attempt_at (see persist.ts's
// recordConfigSyncAttempt and schema.ts's own comment) rather than sync_status
// means this closes the gap for every enabled row, including a vendor's
// very first-ever attempt — there's no insert-vs-update branch here, since
// every enabled row already has exactly one integration_config row. It's
// still best-effort (writeBestEffort) like every other write here — a
// failure to record the attempt must not block the fetch that follows it,
// though a persistently unreachable DB still freezes both this write and
// the outcome write identically; nothing short of the DB being reachable
// closes that.
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
): Promise<SyncOutcome> {
  const identity = { slug: row.slug, vendor: row.vendor };

  await recordAttemptBestEffort(deps, { ...identity, runAt });

  let resolvedConfig: IntegrationConfig | undefined;

  try {
    const provider = deps.registry.get(row.vendor);
    if (!provider) {
      throw new Error(`No provider registered for vendor "${row.vendor}".`);
    }
    resolvedConfig = deps.resolveConfig(row);
    const result = await provider.fetch(resolvedConfig);
    await deps.persistProviderResult(row, result);
  } catch (cause) {
    console.error(`Sync failed for ${row.slug}:${row.vendor}`, cause);
    const redactedMessage = redactSecrets(
      errorMessage(cause),
      resolvedConfig?.secret ?? undefined,
    );
    await recordOutcomeBestEffort(deps, {
      ...identity,
      runAt,
      ok: false,
      error: redactedMessage,
    });
    return { ...identity, ok: false, error: redactedMessage };
  }

  // The fetch + persist above already succeeded — the data is durable —
  // so recording that fact goes through recordOutcomeBestEffort too: a
  // transient failure to write sync_status must not turn an actually
  // successful vendor sync into a reported failure.
  await recordOutcomeBestEffort(deps, {
    ...identity,
    runAt,
    ok: true,
    error: null,
  });
  return { ...identity, ok: true };
}

// The orchestration loop: every enabled integration_config row is synced
// independently, in fixed-size concurrent batches (BATCH_SIZE), sharing one
// `runAt` so every row from this run records the same timestamp wherever it
// gets written. Within a batch, a plain Promise.all (not Promise.allSettled)
// is safe: syncOneIntegration never rejects, per writeBestEffort's comment
// above.
//
// Between batches, the loop checks DEFAULT_RUN_BUDGET_MS (or the deps
// override): once the budget is spent, remaining rows are left unattempted
// for *this* run rather than started, and reported back in
// SyncSummary.skipped rather than silently vanishing from the response.
// That's deliberately not tracked as a `SyncOutcome` failure —
// listEnabledIntegrationConfigs (server/integrations/persist.ts) orders
// rows oldest-attempted-first, so an unattempted row is both eligible for
// and favored by the very next scheduled invocation (every 15 minutes; see
// netlify/functions/scheduled-sync.ts), rotating which rows a routinely-hit
// budget leaves behind rather than starving the same tail forever, with no
// deferred-work state needed here. This rotation guarantee used to have two
// gaps, both stemming from ordering on a value (sync_status.last_run_at)
// that was only ever advanced *after* an attempt completed: (1) a row whose
// provider hangs long enough for Netlify to kill the whole /api/sync
// invocation never reached the outcome write at all, and (2) a row whose
// sync_status outcome write itself kept failing never advanced last_run_at
// either (writeBestEffort swallows write failures by design — see its own
// comment). Either way the row's ordering key would never advance, so it
// would re-occupy the same always-admitted first-batch slot on every
// subsequent run — with enough such rows (BATCH_SIZE), no other enabled row
// would ever sync again, while the response still reported a routine
// `skipped` warning with no signal distinguishing this from healthy
// rotation. This applied just as much to a vendor's very first-ever attempt
// (no sync_status row yet at all) as to one that had synced before — either
// way, nothing advanced until an outcome was recorded.
//
// syncOneIntegration now closes both gaps for every enabled row, first-ever
// attempt included: deps.recordConfigSyncAttempt stamps
// integration_config.last_attempt_at (not sync_status.last_run_at) *before*
// provider.fetch is called and is awaited on its own, and
// listEnabledIntegrationConfigs orders on that column instead. Since every
// enabled row already has exactly one integration_config row, this ordering
// key advances whether the fetch hangs, fails, or the later sync_status
// outcome write itself fails — with no insert-vs-update branch, and without
// ever having to create a sync_status row of defaulted values that would
// misreport an in-flight attempt as a completed failure (see schema.ts's
// comment on last_attempt_at for why that ruled out reusing sync_status for
// this). Short of the DB being unreachable outright, which freezes every
// write identically, attempt stamp included.
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

  const outcomes: SyncOutcome[] = [];
  const batches = chunk(rows, BATCH_SIZE);
  let admittedRowCount = 0;

  for (const batch of batches) {
    const isFirstBatch = admittedRowCount === 0;
    const budgetSpent = monotonicNow() - startedAt >= runBudgetMs;
    if (!isFirstBatch && budgetSpent) {
      break;
    }
    const batchOutcomes = await Promise.all(
      batch.map((row) => syncOneIntegration(row, deps, runAt)),
    );
    outcomes.push(...batchOutcomes);
    admittedRowCount += batch.length;
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
