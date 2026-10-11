import { APPS, INTERNAL_APPS } from "../../../app/config/apps";
import { useDb } from "../../db";
import { listSyncHealthRows } from "../../integrations/persist";
import { requireUser } from "../../utils/auth";
import { fetchIntegrationConfigs } from "../../utils/dashboardQueries";
import { fetchDatabasePanels } from "../../utils/databasePanels";
import { buildNeonOverviewAlerts } from "../../utils/neonUsage";
import { buildSyncAlerts, byNewestFirst } from "../../utils/overviewAlerts";
import { NEON_VENDOR } from "../../../shared/constants/neonPlan";
import type { OverviewAlertsResponse } from "../../../shared/types/alerts";

const NEON_SLUGS = [...APPS, ...INTERNAL_APPS].map((app) => app.slug);

// Only properties whose Neon integration is enabled alert: a disabled one
// leaves its last usage row behind, which must not alert forever.
async function neonAlerts(
  db: ReturnType<typeof useDb>,
): Promise<OverviewAlertsResponse> {
  const configRows = await fetchIntegrationConfigs(db, NEON_SLUGS);
  const enabledSlugs = configRows
    .filter((row) => row.vendor === NEON_VENDOR && row.enabled)
    .map((row) => row.slug);
  return buildNeonOverviewAlerts(await fetchDatabasePanels(db, enabledSlugs));
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
