// Turns a real MetricPoint series into the SVG path `d` string SparkLine.vue
// draws — replaces the hand-authored bezier paths the "/" rollup tiles used
// to hardcode (issue #18). A straight-segment polyline, not a smoothed
// curve: simpler to derive correctly from real, possibly-sparse data than
// fitting bezier control points, and SparkLine only ever needs a valid `d`
// string, not a particular curve style.
import type { MetricPoint } from "#shared/types/dashboard";

// Keeps the line off the very top/bottom edge of the viewBox so a flat or
// near-flat series doesn't clip against the stroke width.
const VERTICAL_PADDING = 4;

// Shared by buildSparklinePath and sparklineEndY so the two never disagree
// on where a value falls in the viewBox — PropertySessionsChart (issue #20)
// needs its endpoint dot at exactly the y a sibling SparkLine would draw the
// same series' final point at.
function rangeOf(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
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
  // case above) rather than letting `(value - min) / range` divide by zero.
  if (max === min) {
    return values
      .map(
        (_value, index) =>
          `${index === 0 ? "M" : "L"}${(index * stepX).toFixed(2)} ${midY.toFixed(2)}`,
      )
      .join(" ");
  }

  const range = max - min;
  const drawableHeight = viewBoxHeight - VERTICAL_PADDING * 2;

  return values
    .map((value, index) => {
      const x = index * stepX;
      const normalized = (value - min) / range;
      const y = VERTICAL_PADDING + (1 - normalized) * drawableHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

// The y-coordinate buildSparklinePath would draw this series' LAST point
// at — PropertySessionsChart (issue #20) renders its endpoint dot from a
// separate `endY` prop rather than parsing one back out of the `d` string.
// Mirrors buildSparklinePath's own three cases (empty/flat/normal) exactly,
// via the same rangeOf helper, so the dot always lands on the line.
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

  const range = max - min;
  const drawableHeight = viewBoxHeight - VERTICAL_PADDING * 2;
  const normalized = (lastOf(values) - min) / range;
  return VERTICAL_PADDING + (1 - normalized) * drawableHeight;
}
