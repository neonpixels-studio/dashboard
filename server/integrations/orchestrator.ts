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
  // fixed value in tests) because this one must actually advance. Defaults
  // to Date.now; tests inject a counter instead of spying on the global.
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

function chunk<Row>(rows: Row[], size: number): Row[][] {
  if (size < 1) {
    throw new Error(`chunk() requires size >= 1, got ${size}.`);
  }
  const batches: Row[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    batches.push(rows.slice(start, start + size));
  }
  return batches;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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
): Promise<SyncOutcome> {
  const identity = { slug: row.slug, vendor: row.vendor };
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
// deferred-work state needed here.
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
  const monotonicNow = deps.monotonicNow ?? Date.now;
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
