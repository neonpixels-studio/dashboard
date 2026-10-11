import { APPS, INTERNAL_APPS } from "../../../app/config/apps";
import { useDb } from "../../db";
import { listSyncHealthRows } from "../../integrations/persist";
import { requireUser } from "../../utils/auth";
import { fetchEnabledDatabasePanels } from "../../utils/databasePanels";
import { buildNeonOverviewAlerts } from "../../utils/neonUsage";
import { buildSyncAlerts, byNewestFirst } from "../../utils/overviewAlerts";
import type { OverviewAlertsResponse } from "../../../shared/types/alerts";

const NEON_SLUGS = [...APPS, ...INTERNAL_APPS].map((app) => app.slug);

async function neonAlerts(
  db: ReturnType<typeof useDb>,
): Promise<OverviewAlertsResponse> {
  return buildNeonOverviewAlerts(
    await fetchEnabledDatabasePanels(db, NEON_SLUGS),
  );
}

// Active problems for the "/" overview Alerts panel, DB-backed only
// (sync_status, neon_usage, neon_branch). Later sources (deploys, CI) add
// their alerts here.
export default defineEventHandler(
  async (event): Promise<OverviewAlertsResponse> => {
    requireUser(event);

    const db = useDb();
    const [syncRows, neon] = await Promise.all([
      listSyncHealthRows(db),
      neonAlerts(db),
    ]);
    return [...buildSyncAlerts(syncRows, new Date()), ...neon].sort(
      byNewestFirst,
    );
  },
);
