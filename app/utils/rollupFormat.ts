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

export function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}

export function formatCompactCount(value: number): string {
  return COMPACT_COUNT_FORMATTER.format(value);
}

export function formatCount(value: number): string {
  return COUNT_FORMATTER.format(value);
}

export type DeltaTone = "ok" | "muted";

// ▲/▼ direction only — "more is better" isn't universal (open issues
// inverts it), so tone is decided by the caller, not derived from the sign
// here.
function deltaArrow(delta: RollupDelta): "▲" | "▼" | "—" {
  if (delta.value > 0) {
    return "▲";
  }
  if (delta.value < 0) {
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
  return `${deltaArrow(delta)} ${Math.abs(delta.pct).toFixed(1)}%`;
}

// "▲ 14" for active subscribers — an absolute count, not a percentage.
export function formatCountDelta(delta: RollupDelta | null): string | null {
  if (!delta) {
    return null;
  }
  return `${deltaArrow(delta)} ${formatCount(Math.abs(delta.value))}`;
}

// The open issues tile's sub-label names a specific day ("N new today"),
// not a trend arrow — phrased as a sentence instead of a signed delta.
export function formatNewToday(delta: RollupDelta | null): string | null {
  if (!delta) {
    return null;
  }
  if (delta.value <= 0) {
    return "No new issues today";
  }
  return `${formatCount(delta.value)} new today`;
}

// "more is better" tiles (MRR, active subscribers, sessions): growth reads
// as the positive/ok tone, anything else is neutral.
export function growthDeltaTone(delta: RollupDelta | null): DeltaTone {
  return delta && delta.value > 0 ? "ok" : "muted";
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
