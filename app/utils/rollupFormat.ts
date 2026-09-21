// Formats the "/" rollup tiles' headline values and deltas (issue #18).
// Pure number/string formatting only — no Vue, no knowledge of which tile
// called it — so it's unit-testable without mounting a component.
import type { RollupDelta } from "#shared/types/dashboard";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const COMPACT_COUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const COUNT_FORMATTER = new Intl.NumberFormat("en-US");

// Every rollup tile's headline value is `null` until that metric's first
// row ever syncs — this is the one placeholder they all share, so it's
// named once here instead of each tile re-typing the em dash.
export const NO_VALUE_LABEL = "—";

export function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}

export function formatCompactCount(value: number): string {
  return COMPACT_COUNT_FORMATTER.format(value);
}

export function formatCount(value: number): string {
  return COUNT_FORMATTER.format(value);
}

// "44%" for the sessions tile's traffic-source split. The shaping layer
// (trafficChannelSplitAcrossApps) rounds to 2 decimal places, not to a
// whole number, so a share can genuinely be "33.33" — round for display
// here rather than printing raw decimals the design never shows.
export function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

// Every rollup tile's headline value goes through this same "null/undefined
// becomes the dash placeholder, otherwise format the real number" branch —
// factored out once it was the same two-line ternary four times over in
// index.vue (mrr/activeSubscribers/sessions30d/openIssues each format
// differently, but never numbers).
export function formatOrDash(
  value: number | null | undefined,
  format: (rawValue: number) => string,
): string {
  return value === null || value === undefined ? NO_VALUE_LABEL : format(value);
}

export type DeltaTone = "ok" | "muted";

// ▲/▼ direction from an already-rounded magnitude — never the raw delta.
// A raw value like 0.3 (pct 0.04%) would otherwise show "▲ 0.0%" (an arrow
// pointing at a percentage that itself displays as zero); classifying
// direction from the SAME rounded number that gets displayed keeps the
// arrow/tone and the printed magnitude from disagreeing.
function directionArrow(roundedMagnitude: number): "▲" | "▼" | "—" {
  if (roundedMagnitude > 0) {
    return "▲";
  }
  if (roundedMagnitude < 0) {
    return "▼";
  }
  return "—";
}

// "▲ 8.2%" for MRR/sessions. Null when there's no delta yet (not enough
// series history) or the series' baseline was zero (a % change off zero is
// undefined) — callers render an empty/loading state instead of a fake 0%.
export function formatPctDelta(delta: RollupDelta | null): string | null {
  if (!delta || delta.pct === null) {
    return null;
  }
  const roundedPct = Number(delta.pct.toFixed(1));
  return `${directionArrow(roundedPct)} ${Math.abs(roundedPct).toFixed(1)}%`;
}

// "▲ 14" for active subscribers — an absolute count, not a percentage.
// Rounded to the nearest whole count before both display and direction, so
// a sub-1 fractional delta (shouldn't normally happen for a count metric,
// but the shaping layer doesn't guarantee it) can't show a nonzero arrow
// next to a rounded-to-zero number.
export function formatCountDelta(delta: RollupDelta | null): string | null {
  if (!delta) {
    return null;
  }
  const roundedValue = Math.round(delta.value);
  return `${directionArrow(roundedValue)} ${formatCount(Math.abs(roundedValue))}`;
}

// The open issues tile's sub-label compares today's rollup to yesterday's —
// phrased as "since yesterday" (not "N new") because metric_snapshot only
// stores a point-in-time total: this is opens minus closes, a net change,
// not a count of newly-opened issues. A true "N new" count needs the
// Sentry provider (#16) to report first-seen timestamps per issue.
// "Yesterday"/"today" are UTC calendar days, so for a US timezone this can
// flip a few hours before local midnight.
export function formatIssuesSinceYesterday(
  delta: RollupDelta | null,
): string | null {
  if (!delta) {
    return null;
  }
  const roundedValue = Math.round(delta.value);
  if (roundedValue === 0) {
    return "No change since yesterday";
  }
  const sign = roundedValue > 0 ? "+" : "−";
  return `${sign}${formatCount(Math.abs(roundedValue))} since yesterday`;
}

function toneFromRoundedMagnitude(magnitude: number): DeltaTone {
  return magnitude > 0 ? "ok" : "muted";
}

// For MRR/sessions, which display formatPctDelta — tone must agree with
// THAT rounding, not the unrounded pct, or a delta that prints "0.0%" could
// still show the ok/green tone next to it.
export function pctGrowthDeltaTone(delta: RollupDelta | null): DeltaTone {
  if (!delta || delta.pct === null) {
    return "muted";
  }
  return toneFromRoundedMagnitude(Number(delta.pct.toFixed(1)));
}

// For active subscribers, which displays formatCountDelta — tone must
// agree with THAT rounding (the whole-count value), not pct, for the same
// reason pctGrowthDeltaTone exists: the two formatters can disagree near
// zero (e.g. `{ value: 1, pct: 0.01 }` prints "▲ 1" but would round to
// "0.0%" under the pct-based tone).
export function countGrowthDeltaTone(delta: RollupDelta | null): DeltaTone {
  if (!delta) {
    return "muted";
  }
  return toneFromRoundedMagnitude(Math.round(delta.value));
}

// GA4's channel buckets (server/integrations/ga4/mapping.ts) presented the
// way the design already framed them before this was wired to real data.
// Falls back to a capitalized form of the raw bucket name so a future bucket
// (see that module's CHANNEL_BUCKET_OTHER comment) still renders something
// readable instead of vanishing.
const CHANNEL_LABELS: Record<string, string> = {
  organic: "Organic search",
  direct: "Direct",
  referral: "Referral & social",
  other: "Other",
};

export function channelLabel(channel: string): string {
  return (
    CHANNEL_LABELS[channel] ??
    `${channel.charAt(0).toUpperCase()}${channel.slice(1)}`
  );
}

// Built by hand (not Intl.DateTimeFormat) so the month abbreviation is
// always exactly 3 letters — ICU's "en-GB" short month format renders
// "Sept", not "Sep", on some Node/ICU versions, which would silently drift
// from the "19 SEP 2026" style the rest of this design uses.
const MONTH_ABBREVIATIONS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

// Shared by formatSyncedDate/formatAxisDate below — both need "DD MON", one
// with the year appended and one without.
function dayMonth(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  return `${day} ${month}`;
}

// "19 SEP 2026" for the "SYNCED Xm ago · 19 SEP 2026" section meta. Returns
// null for an unparseable timestamp rather than rendering "NaN undefined
// NaN" — lastSyncedAt is server-sourced, but a bad value should still fail
// visibly (omitted) rather than corrupt the page.
export function formatSyncedDate(isoTimestamp: string): string | null {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${dayMonth(date)} ${date.getUTCFullYear()}`;
}

// "19 SEP" — same "DD MON" style, without the year, for AxisRow's compact
// chart labels (sparklinePath.ts:buildAxisLabels). AxisRow's own default
// labels are fixed sample dates that describe nothing once real data is
// wired; every chart drawn from a real series builds its own labels from
// that series' own points instead.
export function formatAxisDate(isoTimestamp: string): string | null {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return dayMonth(date);
}
