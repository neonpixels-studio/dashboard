// Turns real GET /api/apps/[slug] metrics (`AppDetailResponse.metrics`/
// `.series`) into MetricTile props (issue #20) — the detail-page counterpart
// to rollupFormat.ts's rollup-tile formatting. A metric that hasn't synced
// yet for this app renders as an honest "not synced" placeholder, never a
// fabricated zero.
//
// The METRIC_*/PERIOD_* constants below mirror server/utils/dashboardMetrics.ts
// (the canonical names, documented on metric_snapshot's own schema comment)
// as plain string literals rather than importing that module — it lives
// under server/ and isn't part of the client bundle.
import type {
  CurrentMetric,
  MetricPoint,
  MetricSeries,
  RollupDelta,
} from "#shared/types/dashboard";
import {
  countGrowthDeltaTone,
  formatCount,
  formatCountDelta,
  formatCurrency,
  formatPctDelta,
  formatSyncedDate,
  NO_VALUE_LABEL,
  pctGrowthDeltaTone,
  type DeltaTone,
} from "./rollupFormat";

export const METRIC_MRR = "mrr";
export const METRIC_ACTIVE_SUBSCRIBERS = "active_subscribers";
export const METRIC_SESSIONS = "sessions";
export const METRIC_OPEN_ISSUES = "open_issues";
export const METRIC_USERS = "users";
export const METRIC_NEW_USERS = "new_users";
export const METRIC_POSTS = "posts";

export const PERIOD_CURRENT = "current";
export const PERIOD_30D = "30d";
export const PERIOD_DAILY = "daily";

// A single point has no trend to draw — the minimum every daily-sessions
// chart (AppDetailProduct's PropertySessionsChart panel, AppDetailMarketing's
// SparkLine, TrafficPanel via buildTrafficPanelData) requires before drawing
// anything, via dailySessionsPoints below.
const MIN_SESSIONS_POINTS = 2;

// The real `sessions`/`daily` points for one app, or null when there isn't
// enough history yet to draw a trend — the one shared gate every daily
// sessions chart in the detail-page layer goes through, so "how many points
// counts as enough" can't drift between them.
export function dailySessionsPoints(
  seriesList: MetricSeries[],
): MetricPoint[] | null {
  const dailySeries = findSeries(seriesList, METRIC_SESSIONS, PERIOD_DAILY);
  if (!dailySeries || dailySeries.points.length < MIN_SESSIONS_POINTS) {
    return null;
  }
  return dailySeries.points;
}

// The only metric currently stored as a dollar amount — every other metric
// (active_subscribers, sessions, open_issues, users, posts, ...) is a plain
// count.
const CURRENCY_METRIC = METRIC_MRR;

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

// noUncheckedIndexedAccess-safe first/last-of-a-non-empty-array, matching
// server/utils/dashboardShaping.ts's firstOf/lastOf (kept local — that
// module lives under server/ and isn't part of the client bundle).
function firstOf(points: MetricPoint[]): MetricPoint {
  return points.reduce((point) => point);
}
function lastOf(points: MetricPoint[]): MetricPoint {
  return points.reduce((_previous, point) => point);
}

// Change from the earliest to the latest point of one app's own metric
// series — same shape and reasoning as dashboardShaping.ts's rollupDelta
// (which aggregates across every app); kept separate since it operates on a
// single app's series and that module isn't importable from the client.
export function seriesDelta(points: MetricPoint[]): RollupDelta | null {
  if (points.length < 2) {
    return null;
  }
  const first = firstOf(points).value;
  const last = lastOf(points).value;
  const value = roundTo2(last - first);
  return { value, pct: first !== 0 ? roundTo2((value / first) * 100) : null };
}

function formatMetricLabel(metric: string): string {
  return metric.replace(/_/g, " ").toUpperCase();
}

function formatMetricValue(metric: string, value: number): string {
  return metric === CURRENCY_METRIC
    ? formatCurrency(value)
    : formatCount(value);
}

function formatMetricDelta(
  metric: string,
  delta: RollupDelta | null,
): { label: string; tone: DeltaTone } {
  if (metric === CURRENCY_METRIC) {
    return {
      label: formatPctDelta(delta) ?? NO_VALUE_LABEL,
      tone: pctGrowthDeltaTone(delta),
    };
  }
  return {
    label: formatCountDelta(delta) ?? NO_VALUE_LABEL,
    tone: countGrowthDeltaTone(delta),
  };
}

// Exported so every other (metric, period) lookup in the detail-page layer
// (trafficPanel.ts, AppDetailProduct/Marketing's own sessions-series lookups)
// shares this one implementation instead of repeating the same `.find()`
// predicate at each call site.
export function findMetric(
  metrics: CurrentMetric[],
  metric: string,
  period: string,
): CurrentMetric | undefined {
  return metrics.find(
    (candidate) => candidate.metric === metric && candidate.period === period,
  );
}

export function findSeries(
  seriesList: MetricSeries[],
  metric: string,
  period: string,
): MetricSeries | undefined {
  return seriesList.find(
    (candidate) => candidate.metric === metric && candidate.period === period,
  );
}

export interface MetricTileData {
  label: string;
  value: string;
  delta: string;
  deltaTone: DeltaTone;
  sub: string;
  // Only ever set by a caller building a tile from something other than a
  // raw metric (e.g. AppDetailWriting's syndication-derived tiles) —
  // buildMetricTileData below never sets it itself.
  tone?: "warn" | "danger" | "ok";
}

// One MetricTile's worth of props for a (metric, period) pair that may or
// may not have synced yet for this app. `sub` reports when this specific
// metric last synced as an absolute date (formatSyncedDate), not a relative
// "Xm ago" — see DataErrorState.vue's comment for why a wall-clock-relative
// render can't run before mount without a hydration mismatch; an absolute
// date is pure data and safe to compute eagerly here.
export function buildMetricTileData(
  metric: string,
  period: string,
  metrics: CurrentMetric[],
  seriesList: MetricSeries[],
): MetricTileData {
  const current = findMetric(metrics, metric, period);
  if (!current) {
    return {
      label: formatMetricLabel(metric),
      value: NO_VALUE_LABEL,
      delta: NO_VALUE_LABEL,
      deltaTone: "muted",
      sub: "Not synced yet",
    };
  }

  const delta = formatMetricDelta(
    metric,
    seriesDelta(findSeries(seriesList, metric, period)?.points ?? []),
  );
  const syncedDate = formatSyncedDate(current.capturedAt);

  return {
    label: formatMetricLabel(metric),
    value: formatMetricValue(metric, current.value),
    delta: delta.label,
    deltaTone: delta.tone,
    sub: syncedDate ? `Synced ${syncedDate}` : "Sync date unknown",
  };
}
