import { APPS } from "../../app/config/apps";
import { useDb } from "../db";
import { requireUser } from "../utils/auth";
import {
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_MRR,
  METRIC_OPEN_ISSUES,
  METRIC_SESSIONS,
} from "../utils/dashboardMetrics";
import {
  fetchMetricSnapshots,
  fetchSyncStatuses,
  fetchTrafficBreakdowns,
} from "../utils/dashboardQueries";
import {
  latestSyncedAt,
  metricSplitByApp,
  sumLatestMetricAcrossApps,
  trafficChannelSplitAcrossApps,
} from "../utils/dashboardShaping";
import type { OverviewResponse } from "../../shared/types/dashboard";

// The "/" rollups, DB-backed only — never a live vendor call. All numbers
// come from metric_snapshot / traffic_breakdown / sync_status; app identity
// (name, accent, ...) stays in app/config/apps.ts and is joined in by the
// frontend, not here.
export default defineEventHandler(async (event): Promise<OverviewResponse> => {
  requireUser(event);

  const db = useDb();
  const slugs = APPS.map((app) => app.slug);

  const [metricRows, breakdownRows, syncRows] = await Promise.all([
    fetchMetricSnapshots(db, slugs),
    fetchTrafficBreakdowns(db, slugs),
    fetchSyncStatuses(db, slugs),
  ]);

  return {
    mrr: sumLatestMetricAcrossApps(metricRows, slugs, METRIC_MRR),
    activeSubscribers: {
      ...sumLatestMetricAcrossApps(
        metricRows,
        slugs,
        METRIC_ACTIVE_SUBSCRIBERS,
      ),
      byApp: metricSplitByApp(metricRows, slugs, METRIC_ACTIVE_SUBSCRIBERS),
    },
    sessions30d: {
      ...sumLatestMetricAcrossApps(metricRows, slugs, METRIC_SESSIONS),
      bySource: trafficChannelSplitAcrossApps(breakdownRows, slugs),
    },
    openIssues: {
      ...sumLatestMetricAcrossApps(metricRows, slugs, METRIC_OPEN_ISSUES),
      byApp: metricSplitByApp(metricRows, slugs, METRIC_OPEN_ISSUES),
    },
    lastSyncedAt: latestSyncedAt(syncRows),
  };
});
