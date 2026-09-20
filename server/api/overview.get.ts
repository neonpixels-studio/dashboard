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
  metricRollupWithSplit,
  trafficChannelSplitAcrossApps,
} from "../utils/dashboardShaping";
import type {
  MetricSnapshotRow,
  TrafficBreakdownRow,
} from "../utils/dashboardQueries";
import type { OverviewResponse } from "../../shared/types/dashboard";

// Named field-by-field (not `...metricRollupWithSplit(...)`):
// metricRollupWithSplit's `byApp` isn't part of `sessions30d` (that field is
// `bySource` instead), so spreading it in would leak an undeclared property
// into the response.
function buildSessionsRollup(
  metricRows: MetricSnapshotRow[],
  breakdownRows: TrafficBreakdownRow[],
  slugs: string[],
): OverviewResponse["sessions30d"] {
  const sessionsRollup = metricRollupWithSplit(
    metricRows,
    slugs,
    METRIC_SESSIONS,
    PERIOD_30D,
  );
  return {
    value: sessionsRollup.value,
    period: sessionsRollup.period,
    capturedAt: sessionsRollup.capturedAt,
    bySource: trafficChannelSplitAcrossApps(breakdownRows, metricRows, slugs),
  };
}

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
    mrr: metricRollupWithSplit(metricRows, slugs, METRIC_MRR, PERIOD_CURRENT),
    activeSubscribers: metricRollupWithSplit(
      metricRows,
      slugs,
      METRIC_ACTIVE_SUBSCRIBERS,
      PERIOD_CURRENT,
    ),
    sessions30d: buildSessionsRollup(metricRows, breakdownRows, slugs),
    openIssues: metricRollupWithSplit(
      metricRows,
      slugs,
      METRIC_OPEN_ISSUES,
      PERIOD_CURRENT,
    ),
    lastSyncedAt: latestSyncedAt(syncRows),
  };
});
