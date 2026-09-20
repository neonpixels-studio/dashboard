import { APPS } from "../../app/config/apps";
import { useDb } from "../db";
import { requireUser } from "../utils/auth";
import {
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_MRR,
  METRIC_OPEN_ISSUES,
  METRIC_SESSIONS,
  PERIOD_30D,
  PERIOD_CURRENT,
} from "../utils/dashboardMetrics";
import {
  fetchLatestMetricSnapshots,
  fetchLatestTrafficBreakdowns,
  fetchSyncStatuses,
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
    fetchLatestMetricSnapshots(db, slugs),
    fetchLatestTrafficBreakdowns(db, slugs),
    fetchSyncStatuses(db, slugs),
  ]);

  return {
    mrr: sumLatestMetricAcrossApps(
      metricRows,
      slugs,
      METRIC_MRR,
      PERIOD_CURRENT,
    ),
    activeSubscribers: {
      ...sumLatestMetricAcrossApps(
        metricRows,
        slugs,
        METRIC_ACTIVE_SUBSCRIBERS,
        PERIOD_CURRENT,
      ),
      byApp: metricSplitByApp(
        metricRows,
        slugs,
        METRIC_ACTIVE_SUBSCRIBERS,
        PERIOD_CURRENT,
      ),
    },
    sessions30d: {
      ...sumLatestMetricAcrossApps(
        metricRows,
        slugs,
        METRIC_SESSIONS,
        PERIOD_30D,
      ),
      bySource: trafficChannelSplitAcrossApps(breakdownRows, slugs),
    },
    openIssues: {
      ...sumLatestMetricAcrossApps(
        metricRows,
        slugs,
        METRIC_OPEN_ISSUES,
        PERIOD_CURRENT,
      ),
      byApp: metricSplitByApp(
        metricRows,
        slugs,
        METRIC_OPEN_ISSUES,
        PERIOD_CURRENT,
      ),
    },
    lastSyncedAt: latestSyncedAt(syncRows),
  };
});
