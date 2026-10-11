import { useDb } from "../../db";
import { listSyncHealthRows } from "../../integrations/persist";
import { requireUser } from "../../utils/auth";
import { fetchDeployStatuses } from "../../utils/dashboardQueries";
import { buildOverviewAlerts } from "../../utils/overviewAlerts";
import type { OverviewAlertsResponse } from "../../../shared/types/alerts";

// Active problems for the "/" overview Alerts panel, DB-backed only
// (sync_status and deploy_status). Later sources (CI) add their alerts here.
export default defineEventHandler(
  async (event): Promise<OverviewAlertsResponse> => {
    requireUser(event);

    const db = useDb();
    const [syncRows, deployRows] = await Promise.all([
      listSyncHealthRows(db),
      fetchDeployStatuses(db),
    ]);
    return buildOverviewAlerts(syncRows, deployRows, new Date());
  },
);
