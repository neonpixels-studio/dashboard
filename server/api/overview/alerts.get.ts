import { useDb } from "../../db";
import { readNetlifyToken } from "../../integrations/netlify/token";
import { listSyncHealthRows } from "../../integrations/persist";
import { requireUser } from "../../utils/auth";
import {
  fetchDeployStatuses,
  type DeployStatusRow,
  type DrizzleDb,
} from "../../utils/dashboardQueries";
import { buildOverviewAlerts } from "../../utils/overviewAlerts";
import type { OverviewAlertsResponse } from "../../../shared/types/alerts";

// Without a token the detail tile reads "not configured", so a deploy row left
// over from before the token was removed must not keep alerting.
async function loadDeployRows(db: DrizzleDb): Promise<DeployStatusRow[]> {
  if (!readNetlifyToken()) {
    return [];
  }
  return fetchDeployStatuses(db);
}

// Active problems for the "/" overview Alerts panel, DB-backed only
// (sync_status and deploy_status). Later sources (CI) add their alerts here.
export default defineEventHandler(
  async (event): Promise<OverviewAlertsResponse> => {
    requireUser(event);

    const db = useDb();
    const [syncRows, deployRows] = await Promise.all([
      listSyncHealthRows(db),
      loadDeployRows(db),
    ]);
    return buildOverviewAlerts(syncRows, deployRows, new Date());
  },
);
