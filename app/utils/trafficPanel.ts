// Builds TrafficPanel's props from a real AppDetailResponse (issue #20),
// shared by AppDetailProduct and AppDetailWriting — the two templates that
// render a TrafficPanel. `stats`/`lists` only ever include entries backed by
// real data: GA4 traffic_breakdown has no per-page or per-referrer
// dimension (only a channel split), so the original design's "TOP PAGES" /
// "TOP REFERRERS" lists have no honest source and aren't reproduced here —
// the one real list (channel split) renders as "TRAFFIC SOURCES" instead.
// Likewise "AVG TIME"/"BOUNCE" have no metric_snapshot column, so `stats`
// only ever contains the one real headline number: sessions/30d.
import type {
  AppDetailResponse,
  TrafficChannelSplit,
} from "#shared/types/dashboard";
import {
  channelLabel,
  formatCount,
  formatPct,
  formatPctDelta,
  NO_VALUE_LABEL,
} from "./rollupFormat";
import {
  dailySessionsPoints,
  findMetric,
  findSeries,
  METRIC_SESSIONS,
  PERIOD_30D,
  seriesDelta,
} from "./metricTile";
import { buildAxisLabels, buildSparklinePath } from "./sparklinePath";

export const TRAFFIC_PANEL_VIEWBOX_WIDTH = 860;
export const TRAFFIC_PANEL_VIEWBOX_HEIGHT = 150;

// Real traffic_breakdown rows, sorted largest share first — shared by
// TrafficPanel's "TRAFFIC SOURCES" list (below) and AppDetailMarketing's own
// StatList of the same channel split (it doesn't render a TrafficPanel at
// all).
export function buildTrafficSourceItems(
  trafficBreakdown: TrafficChannelSplit[],
): { label: string; value: string }[] {
  return [...trafficBreakdown]
    .sort((a, b) => b.pct - a.pct)
    .map((row) => ({
      label: channelLabel(row.channel),
      value: formatPct(row.pct),
    }));
}

export interface TrafficPanelData {
  stats: { label: string; value: string }[];
  delta: string;
  path: string;
  axisLabels: string[];
  lists: { title: string; items: { label: string; value: string }[] }[];
}

export function buildTrafficPanelData(
  detail: AppDetailResponse | null,
): TrafficPanelData {
  if (!detail) {
    return {
      stats: [],
      delta: NO_VALUE_LABEL,
      path: "",
      axisLabels: [],
      lists: [],
    };
  }

  const sessions30d = findMetric(detail.metrics, METRIC_SESSIONS, PERIOD_30D);
  const sessions30dSeries = findSeries(
    detail.series,
    METRIC_SESSIONS,
    PERIOD_30D,
  );
  // Same "at least 2 points" gate every daily-sessions chart in the
  // detail-page layer shares (see dailySessionsPoints' own doc comment) —
  // null here means "not enough history yet", not "no chart at all"; the
  // path/axisLabels below both fall back to empty in that case.
  const dailyPoints = dailySessionsPoints(detail.series);

  // Full comma-separated count (formatCount), not the "/"-page rollup's
  // compact "61.3K" style (formatCompactCount) — the original design's
  // traffic-panel headline was always a precise per-app number ("8,612").
  const stats = sessions30d
    ? [{ label: "SESSIONS · 30D", value: formatCount(sessions30d.value) }]
    : [];

  const delta =
    formatPctDelta(seriesDelta(sessions30dSeries?.points ?? [])) ??
    NO_VALUE_LABEL;

  const path = dailyPoints
    ? buildSparklinePath(
        dailyPoints,
        TRAFFIC_PANEL_VIEWBOX_WIDTH,
        TRAFFIC_PANEL_VIEWBOX_HEIGHT,
      )
    : "";

  const axisLabels = dailyPoints ? buildAxisLabels(dailyPoints) : [];

  const trafficSourceItems = buildTrafficSourceItems(detail.trafficBreakdown);

  const lists = trafficSourceItems.length
    ? [{ title: "TRAFFIC SOURCES", items: trafficSourceItems }]
    : [];

  return { stats, delta, path, axisLabels, lists };
}
