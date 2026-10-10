import { APPS, INTERNAL_APPS } from "../../app/config/apps";
import { useDb } from "../db";
import { requireUser } from "../utils/auth";
import { readOverviewRange } from "../utils/overviewRange";
import {
  DEFAULT_OVERVIEW_RANGE,
  type OverviewRangeDays,
} from "../../shared/constants/overviewRange";
import {
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_MRR,
  METRIC_OPEN_ISSUES,
  METRIC_SESSIONS,
  PERIOD_30D,
  PERIOD_CURRENT,
  PERIOD_DAILY,
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
  windowedTotalAcrossApps,
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

// Open issues' "since yesterday" copy compares just the last two UTC
// calendar days of the series (rather than the default 30-day window every
// other rollup delta uses) — the one tile whose copy names a specific
// day-over-day comparison, not a rolling trend.
const OPEN_ISSUES_DELTA_WINDOW_DAYS = 2;

interface DeltaSeriesOptions {
  seriesRows: MetricSnapshotRow[];
  slugs: string[];
  metric: string;
  period: string;
  windowDays?: number;
}

// An options object rather than five positional args — `metric` and
// `period` are adjacent same-typed strings, easy to swap by accident at a
// call site with no compiler error to catch it.
function withDelta<Total extends RollupTotal>(
  total: Total,
  options: DeltaSeriesOptions,
): Total & Pick<OverviewMetric, "delta"> {
  const series = rollupSeriesAcrossApps(
    options.seriesRows,
    options.slugs,
    options.metric,
    options.period,
    options.windowDays,
  );
  return { ...total, delta: rollupDelta(series) };
}

// Sessions is the one rollup whose headline number the vendor hands over
// already aggregated over a fixed 30 days (GA4's rolling `30d` row), so
// slicing stored rows can't re-window it. It's derived instead from the
// stored per-day rows (GA4 backfills them), summed over the selected range.
// Fallback when no daily rows exist yet: the default 30-day range keeps the
// vendor's own 30d total (that IS the 30-day answer); other ranges have no
// honest number, so null (rendered as a dash) rather than a mislabelled 30d.
function resolveSessionsTotal(
  metricRows: MetricSnapshotRow[],
  seriesRows: MetricSnapshotRow[],
  slugs: string[],
  range: OverviewRangeDays,
): RollupTotal {
  const vendorTotal = metricRollupWithSplit(
    metricRows,
    slugs,
    METRIC_SESSIONS,
    PERIOD_30D,
  );
  const derived = windowedTotalAcrossApps(
    seriesRows,
    slugs,
    METRIC_SESSIONS,
    PERIOD_DAILY,
    range,
  );
  if (derived !== null) {
    return {
      value: derived,
      period: `${range}d`,
      capturedAt: vendorTotal.capturedAt,
    };
  }
  if (range === DEFAULT_OVERVIEW_RANGE) {
    const { value, period, capturedAt } = vendorTotal;
    return { value, period, capturedAt };
  }
  return { value: null, period: null, capturedAt: null };
}

// Named field-by-field (not spreading metricRollupWithSplit): its `byApp`
// isn't part of `sessions30d` (that field is `bySource` instead), so
// spreading it in would leak an undeclared property into the response.
// The channel split stays on the vendor's fixed 30-day basis (GA4's channel
// report has no per-day rows to re-window), so it's weighted against the
// vendor's 30d total, not the range total.
function buildSessionsRollup(
  metricRows: MetricSnapshotRow[],
  seriesRows: MetricSnapshotRow[],
  breakdownRows: TrafficBreakdownRow[],
  slugs: string[],
  range: OverviewRangeDays,
): OverviewResponse["sessions30d"] {
  const vendorTotal = metricRollupWithSplit(
    metricRows,
    slugs,
    METRIC_SESSIONS,
    PERIOD_30D,
  );
  return {
    ...withDelta(resolveSessionsTotal(metricRows, seriesRows, slugs, range), {
      seriesRows,
      slugs,
      metric: METRIC_SESSIONS,
      period: PERIOD_30D,
      windowDays: range,
    }),
    bySource: trafficChannelSplitAcrossApps(
      breakdownRows,
      metricRows,
      slugs,
      vendorTotal.value ?? 0,
    ),
  };
}

// The "/" rollups, DB-backed only — never a live vendor call. All numbers
// come from metric_snapshot / traffic_breakdown / sync_status; app identity
// (name, accent, ...) stays in app/config/apps.ts and is joined in by the
// frontend, not here.
export default defineEventHandler(async (event): Promise<OverviewResponse> => {
  requireUser(event);
  const range = readOverviewRange(event);

  const db = useDb();
  const slugs = APPS.map((app) => app.slug);
  // Internal apps only ever sync Sentry, so they join the open-issues rollup
  // (and sync freshness) without touching any property-only tile.
  const issueSlugs = [...slugs, ...INTERNAL_APPS.map((app) => app.slug)];

  const [metricRows, seriesRows, breakdownRows, syncRows] = await Promise.all([
    fetchLatestMetricSnapshots(db, issueSlugs),
    fetchMetricSnapshotSeries(db, issueSlugs),
    fetchLatestTrafficBreakdowns(db, slugs),
    fetchSyncStatuses(db, issueSlugs),
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
    range,
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
      {
        seriesRows,
        slugs,
        metric: METRIC_ACTIVE_SUBSCRIBERS,
        period: PERIOD_CURRENT,
        windowDays: range,
      },
    ),
    sessions30d: buildSessionsRollup(
      metricRows,
      seriesRows,
      breakdownRows,
      slugs,
      range,
    ),
    openIssues: withDelta(
      metricRollupWithSplit(
        metricRows,
        issueSlugs,
        METRIC_OPEN_ISSUES,
        PERIOD_CURRENT,
      ),
      {
        seriesRows,
        slugs: issueSlugs,
        metric: METRIC_OPEN_ISSUES,
        period: PERIOD_CURRENT,
        windowDays: OPEN_ISSUES_DELTA_WINDOW_DAYS,
      },
    ),
    lastSyncedAt: latestSyncedAt(syncRows),
  };
});
