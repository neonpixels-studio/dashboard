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

export interface SyncSummary {
  outcomes: SyncOutcome[];
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
// fine there. `sync_status.error` is different: it's a persisted, later-read
// column, so the same raw message is passed through redactSecrets() (see
// server/utils/redactSecrets.ts) before it's handed to
// recordSyncStatusBestEffort, stripping known secret material a raw vendor
// SDK error can echo back (API keys, tokens, credential query params/
// headers).
async function syncOneIntegration(
  row: IntegrationConfigRow,
  deps: SyncOrchestratorDeps,
  runAt: Date,
): Promise<SyncOutcome> {
  const identity = { slug: row.slug, vendor: row.vendor };

  try {
    const provider = deps.registry.get(row.vendor);
    if (!provider) {
      throw new Error(`No provider registered for vendor "${row.vendor}".`);
    }
    const config = deps.resolveConfig(row);
    const result = await provider.fetch(config);
    await deps.persistProviderResult(row, result);
  } catch (cause) {
    const message = errorMessage(cause);
    console.error(`Sync failed for ${row.slug}:${row.vendor}`, cause);
    await recordSyncStatusBestEffort(deps, {
      ...identity,
      runAt,
      ok: false,
      error: redactSecrets(message),
    });
    return { ...identity, ok: false, error: message };
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
// independently and concurrently, sharing one `runAt` so every row from this
// run records the same last_run_at. A plain Promise.all (not
// Promise.allSettled) is safe: syncOneIntegration never rejects, per
// recordSyncStatusBestEffort's comment above.
export async function runSync(
  deps: SyncOrchestratorDeps,
): Promise<SyncSummary> {
  const rows = await deps.listEnabledConfigRows();
  const runAt = (deps.now ?? (() => new Date()))();
  const outcomes = await Promise.all(
    rows.map((row) => syncOneIntegration(row, deps, runAt)),
  );
  return { outcomes };
}
