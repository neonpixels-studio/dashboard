// Turns a real MetricPoint series into the SVG path `d` string SparkLine.vue
// draws — replaces the hand-authored bezier paths the "/" rollup tiles used
// to hardcode (issue #18). A straight-segment polyline, not a smoothed
// curve: simpler to derive correctly from real, possibly-sparse data than
// fitting bezier control points, and SparkLine only ever needs a valid `d`
// string, not a particular curve style.
import type { MetricPoint } from "#shared/types/dashboard";
import { formatAxisDate } from "./rollupFormat";

// Keeps the line off the very top/bottom edge of the viewBox so a flat or
// near-flat series doesn't clip against the stroke width.
const VERTICAL_PADDING = 4;

function rangeOf(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

// The one place a value becomes a y-coordinate — shared by buildSparklinePath
// and sparklineEndY so the two can never disagree on where a value falls in
// the viewBox (PropertySessionsChart's endpoint dot needs to land exactly on
// the line a sibling SparkLine draws for the same series). `min === max`
// (a perfectly flat series has no range to normalize against) is the
// caller's job to special-case before calling this — this function assumes
// a real, non-zero range.
function valueToY(
  value: number,
  min: number,
  max: number,
  viewBoxHeight: number,
): number {
  const range = max - min;
  const drawableHeight = viewBoxHeight - VERTICAL_PADDING * 2;
  const normalized = (value - min) / range;
  return VERTICAL_PADDING + (1 - normalized) * drawableHeight;
}

// noUncheckedIndexedAccess-safe "last element of a non-empty array" — same
// trick as server/utils/dashboardShaping.ts's lastOf, kept local since this
// module only ever needs it for numbers.
function lastOf(values: number[]): number {
  return values.reduce((_previous, value) => value);
}

export function buildSparklinePath(
  points: MetricPoint[],
  viewBoxWidth: number,
  viewBoxHeight: number,
): string {
  if (!points.length) {
    return "";
  }

  const midY = viewBoxHeight / 2;
  if (points.length === 1) {
    return `M0 ${midY} L${viewBoxWidth} ${midY}`;
  }

  const values = points.map((point) => point.value);
  const { min, max } = rangeOf(values);
  const stepX = viewBoxWidth / (points.length - 1);

  // A perfectly flat series (every value equal) has no range to normalize
  // against — drawing it as a centered flat line (like the single-point
  // case above) rather than letting valueToY divide by zero.
  if (max === min) {
    return values
      .map(
        (_value, index) =>
          `${index === 0 ? "M" : "L"}${(index * stepX).toFixed(2)} ${midY.toFixed(2)}`,
      )
      .join(" ");
  }

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = valueToY(value, min, max, viewBoxHeight);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

// The y-coordinate buildSparklinePath would draw this series' LAST point
// at — PropertySessionsChart (issue #20) renders its endpoint dot from a
// separate `endY` prop rather than parsing one back out of the `d` string.
// Shares valueToY with buildSparklinePath (and mirrors its empty/flat/normal
// cases) so the dot always lands on the line.
export function sparklineEndY(
  points: MetricPoint[],
  viewBoxHeight: number,
): number {
  const midY = viewBoxHeight / 2;
  if (points.length < 2) {
    return midY;
  }

  const values = points.map((point) => point.value);
  const { min, max } = rangeOf(values);
  if (max === min) {
    return midY;
  }

  return valueToY(lastOf(values), min, max, viewBoxHeight);
}

// Three evenly spaced date labels (first, middle, last point) for AxisRow —
// built from a chart's own real series rather than AxisRow's default labels,
// which are fixed sample dates ("20 AUG" … "19 SEP") that describe nothing
// once a chart is actually wired to live data. Returns an empty array for
// fewer than two points (AxisRow then falls back to its own default, but
// callers pair this with the same points a chart declined to draw for too
// few points, so that fallback shouldn't normally render).
export function buildAxisLabels(points: MetricPoint[]): string[] {
  if (points.length < 2) {
    return [];
  }
  const middleIndex = Math.floor((points.length - 1) / 2);
  // A 2-point series has no distinct middle (middleIndex lands on 0, the
  // same as the first point) — de-duplicating the index list first keeps
  // that case to a real [first, last] pair instead of repeating one date.
  const uniqueIndices = [...new Set([0, middleIndex, points.length - 1])];
  return uniqueIndices
    .map((index) => points.at(index))
    .filter((point): point is MetricPoint => point !== undefined)
    .map((point) => formatAxisDate(point.capturedAt))
    .filter((label): label is string => label !== null);
}
