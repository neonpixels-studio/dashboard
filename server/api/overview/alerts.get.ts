import { useDb } from "../../db";
import { listSyncHealthRows } from "../../integrations/persist";
import { requireUser } from "../../utils/auth";
import { buildSyncAlerts } from "../../utils/overviewAlerts";
import type { OverviewAlertsResponse } from "../../../shared/types/alerts";

// Active problems for the "/" overview Alerts panel, DB-backed only
// (sync_status). Later sources (deploys, CI) add their alerts here.
export default defineEventHandler(
  async (event): Promise<OverviewAlertsResponse> => {
    requireUser(event);

    const rows = await listSyncHealthRows(useDb());
    return buildSyncAlerts(rows, new Date());
  },
);
