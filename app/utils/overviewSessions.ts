// Turns GET /api/overview/sessions into what the "/" sessions panel renders:
// the multi-line chart series, its axis labels, and the 30-day totals list.
// Property identity (name/accent) is joined in from app config here, not
// the server.
import type { MetricPoint } from "#shared/types/dashboard";
import type { PropertySessions } from "#shared/types/overviewSessions";
import { findAppBySlug, sortByAppOrder } from "~/config/apps";
import type { StatListItem } from "~/components/StatList.vue";
import {
  formatCompactCount,
  formatOrDash,
  formatPctDelta,
  pctGrowthDeltaTone,
} from "./rollupFormat";
import {
  buildAxisLabels,
  buildSparklinePath,
  domainOf,
  sparklineEndY,
} from "./sparklinePath";

export const SESSIONS_CHART_VIEWBOX_WIDTH = 900;
export const SESSIONS_CHART_VIEWBOX_HEIGHT = 200;

// Same "need two points to draw a trend" gate the detail-page charts use
// (metricTile.ts:dailySessionsPoints).
const MIN_CHART_POINTS = 2;

const FALLBACK_COLOR = "var(--ink-3)";

function accentFor(slug: string): string {
  return findAppBySlug(slug)?.accent ?? FALLBACK_COLOR;
}

function drawableProperties(properties: PropertySessions[]) {
  return sortByAppOrder(properties).filter(
    (property) => property.daily.length >= MIN_CHART_POINTS,
  );
}

function dayKeyOf(point: MetricPoint): string {
  return point.capturedAt.slice(0, 10);
}

// Every day any drawable property has a point for, oldest first - the
// shared x-axis the lines are placed on by date (not by point count), so a
// stale or gappy property doesn't drift onto the wrong days.
function sharedDayKeys(properties: PropertySessions[]): string[] {
  const dayKeys = new Set(
    properties.flatMap((property) => property.daily.map(dayKeyOf)),
  );
  return [...dayKeys].sort();
}

// All lines share one y-scale so a small property reads as small next to a
// large one, instead of every line stretching to the full chart height.
export function buildSessionsChartSeries(properties: PropertySessions[]) {
  const drawable = drawableProperties(properties);
  const domain = domainOf(drawable.map((property) => property.daily));
  if (!domain) {
    return [];
  }
  const dayKeys = sharedDayKeys(drawable);
  const slotFor = (point: MetricPoint) => dayKeys.indexOf(dayKeyOf(point));
  const options = { domain, totalSlots: dayKeys.length, slotFor };
  const stepX = SESSIONS_CHART_VIEWBOX_WIDTH / (dayKeys.length - 1);

  return drawable.map((property) => ({
    slug: property.slug,
    color: accentFor(property.slug),
    path: buildSparklinePath(
      property.daily,
      SESSIONS_CHART_VIEWBOX_WIDTH,
      SESSIONS_CHART_VIEWBOX_HEIGHT,
      options,
    ),
    endX: slotFor(property.daily.at(-1) as MetricPoint) * stepX,
    endY: roundCoordinate(
      sparklineEndY(property.daily, SESSIONS_CHART_VIEWBOX_HEIGHT, domain),
    ),
  }));
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

// Labels span the shared day range, so they describe the same x-axis the
// lines are placed on.
export function buildSessionsAxisLabels(
  properties: PropertySessions[],
): string[] {
  const dayKeys = sharedDayKeys(drawableProperties(properties));
  return buildAxisLabels(
    dayKeys.map((dayKey) => ({
      capturedAt: `${dayKey}T00:00:00.000Z`,
      value: 0,
    })),
  );
}

export function buildSessionsAriaLabel(properties: PropertySessions[]): string {
  const count = drawableProperties(properties).length;
  return `Daily sessions for ${count} ${count === 1 ? "property" : "properties"}.`;
}

// Largest 30-day total first; a property with no 30d total yet is left out
// rather than listed with a fabricated zero.
export function buildSessionsTotals(
  properties: PropertySessions[],
): StatListItem[] {
  return properties
    .filter((property) => property.total30d !== null)
    .sort((a, b) => (b.total30d ?? 0) - (a.total30d ?? 0))
    .map((property) => ({
      label: findAppBySlug(property.slug)?.name ?? property.slug,
      value: formatOrDash(property.total30d, formatCompactCount),
      delta: formatPctDelta(property.delta) ?? undefined,
      deltaTone: pctGrowthDeltaTone(property.delta),
      swatch: accentFor(property.slug),
    }));
}
