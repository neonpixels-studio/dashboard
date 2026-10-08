import { useDb } from "../db";
import type { SyncSummary } from "../integrations/orchestrator";
import { runSync } from "../integrations/orchestrator";
import { listSyncHealthRows } from "../integrations/persist";
import type { PruneSummary } from "../integrations/retention";
import { pruneOldSnapshots } from "../integrations/retention";
import { alertOnStaleVendors } from "../integrations/staleVendorAlert";
import { buildSyncOrchestratorDeps } from "../integrations/syncDeps";
import { reportError } from "../utils/errorReporting";
import { requireSyncTriggerSecret } from "../utils/syncTrigger";

// Silent when a drained backlog leaves nothing to delete, so the 15-minute
// cadence doesn't log a no-op line on every run.
function logPruneSummary(summary: PruneSummary): void {
  if (summary.metricSnapshotDeleted + summary.trafficBreakdownDeleted === 0) {
    return;
  }
  console.info("sync: retention prune", summary);
}

// The manual/backfill trigger the issue asks for, and also the only thing
// netlify/functions/scheduled-sync.ts calls — the scheduled function is a
// thin, unauthenticated-by-Nitro Netlify Function with no access to
// useDb()/useRuntimeConfig() (those only exist inside the Nuxt/Nitro
// runtime), so it can't run the orchestrator in-process. It reaches this
// same code path over HTTP instead, presenting NUXT_SYNC_TRIGGER_SECRET —
// see that file's own comment for why nitro.scheduledTasks isn't used here.
export default defineEventHandler(async (event): Promise<SyncSummary> => {
  requireSyncTriggerSecret(event);

  const db = useDb();
  try {
    return await runSync(buildSyncOrchestratorDeps(db));
  } finally {
    // Catches a single vendor failing or going unsynced for hours, which the
    // scheduled function's all-vendors-failed check cannot see (it has no DB
    // access). Runs even when runSync rejects, since a dead sync is exactly
    // when vendors go stale. alertOnStaleVendors handles its own query
    // failures; the catch covers anything else so a monitoring bug can't
    // mask the sync result.
    // @todo Nothing alerts if the scheduler stops calling this route at all;
    // that needs a Sentry Cron Monitor check-in on the scheduled function.
    await alertOnStaleVendors({
      listSyncHealthRows: () => listSyncHealthRows(db),
    }).catch((error) => reportError("sync: stale vendor alert failed", error));
    // Bounded retention prune (see retention.ts). Isolated like the alert
    // above so a prune failure can never mask the sync result.
    await pruneOldSnapshots(db)
      .then(logPruneSummary)
      .catch((error) =>
        reportError("sync: snapshot retention prune failed", error),
      );
  }
});
