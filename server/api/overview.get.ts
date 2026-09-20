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
  fetchMetricSnapshotSeries,
  fetchSyncStatuses,
} from "../utils/dashboardQueries";
import {
  latestSyncedAt,
  metricRollupWithSplit,
  rollupDelta,
  rollupSeriesAcrossApps,
  trafficChannelSplitAcrossApps,
} from "../utils/dashboardShaping";
import type {
  MetricSnapshotRow,
  TrafficBreakdownRow,
} from "../utils/dashboardQueries";
import type {
  OverviewMetric,
  OverviewResponse,
  RollupTotal,
} from "../../shared/types/dashboard";

// "N new today" for open issues compares just the last two UTC calendar days
// of the series (rather than the default 30-day window every other rollup
// delta uses) — the one tile whose copy names a specific day, not a rolling
// trend.
const OPEN_ISSUES_DELTA_WINDOW_DAYS = 2;

function withDelta<Total extends RollupTotal>(
  total: Total,
  seriesRows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
  period: string,
  windowDays?: number,
): Total & Pick<OverviewMetric, "delta"> {
  const series = rollupSeriesAcrossApps(
    seriesRows,
    slugs,
    metric,
    period,
    windowDays,
  );
  return { ...total, delta: rollupDelta(series) };
}

// Named field-by-field (not `...metricRollupWithSplit(...)`):
// metricRollupWithSplit's `byApp` isn't part of `sessions30d` (that field is
// `bySource` instead), so spreading it in would leak an undeclared property
// into the response.
function buildSessionsRollup(
  metricRows: MetricSnapshotRow[],
  seriesRows: MetricSnapshotRow[],
  breakdownRows: TrafficBreakdownRow[],
  slugs: string[],
): OverviewResponse["sessions30d"] {
  const sessionsRollup = metricRollupWithSplit(
    metricRows,
    slugs,
    METRIC_SESSIONS,
    PERIOD_30D,
  );
  const { value, period, capturedAt } = sessionsRollup;
  return {
    ...withDelta(
      { value, period, capturedAt },
      seriesRows,
      slugs,
      METRIC_SESSIONS,
      PERIOD_30D,
    ),
    bySource: trafficChannelSplitAcrossApps(
      breakdownRows,
      metricRows,
      slugs,
      sessionsRollup.value ?? 0,
    ),
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

  const [metricRows, seriesRows, breakdownRows, syncRows] = await Promise.all([
    fetchLatestMetricSnapshots(db, slugs),
    fetchMetricSnapshotSeries(db, slugs),
    fetchLatestTrafficBreakdowns(db, slugs),
    fetchSyncStatuses(db, slugs),
  ]);

  const mrrRollup = metricRollupWithSplit(
    metricRows,
    slugs,
    METRIC_MRR,
    PERIOD_CURRENT,
  );
  const mrrSeries = rollupSeriesAcrossApps(
    seriesRows,
    slugs,
    METRIC_MRR,
    PERIOD_CURRENT,
  );

  return {
    mrr: {
      ...mrrRollup,
      delta: rollupDelta(mrrSeries),
      series: mrrSeries,
    },
    activeSubscribers: withDelta(
      metricRollupWithSplit(
        metricRows,
        slugs,
        METRIC_ACTIVE_SUBSCRIBERS,
        PERIOD_CURRENT,
      ),
      seriesRows,
      slugs,
      METRIC_ACTIVE_SUBSCRIBERS,
      PERIOD_CURRENT,
    ),
    sessions30d: buildSessionsRollup(
      metricRows,
      seriesRows,
      breakdownRows,
      slugs,
    ),
    openIssues: withDelta(
      metricRollupWithSplit(
        metricRows,
        slugs,
        METRIC_OPEN_ISSUES,
        PERIOD_CURRENT,
      ),
      seriesRows,
      slugs,
      METRIC_OPEN_ISSUES,
      PERIOD_CURRENT,
      OPEN_ISSUES_DELTA_WINDOW_DAYS,
    ),
    lastSyncedAt: latestSyncedAt(syncRows),
  };
});
