import type { Ga4ReportRow } from "./types";

const YYYYMMDD_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const PERCENTAGE_MULTIPLIER = 100;
const PERCENTAGE_DECIMAL_PLACES = 2;

export interface Ga4DailySessionPoint {
  date: Date;
  sessions: number;
}

export interface Ga4ChannelBreakdown {
  channel: string;
  pct: number;
}

function toYyyymmdd(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Parses a GA4 `date` dimension value (always `YYYYMMDD`, e.g. "20260919")
 * into a UTC midnight Date. Fails loud on anything else rather than silently
 * mis-dating a sparkline point — a format change here would otherwise be
 * indistinguishable from a legitimate date far in the past/future. The regex
 * alone only checks shape, not range (e.g. "20261301" or "20260931" would
 * otherwise silently roll over into the following month via `Date.UTC`), so
 * the parsed date is round-tripped back through the same format and compared
 * against the input.
 */
export function parseGa4Date(dateDimensionValue: string): Date {
  const match = YYYYMMDD_PATTERN.exec(dateDimensionValue);
  if (!match) {
    throw new Error(
      `GA4 date dimension value "${dateDimensionValue}" is not in the expected YYYYMMDD format.`,
    );
  }
  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (toYyyymmdd(parsed) !== dateDimensionValue) {
    throw new Error(
      `GA4 date dimension value "${dateDimensionValue}" is not a real calendar date.`,
    );
  }
  return parsed;
}

/**
 * Parses a GA4 metric value (always a numeric string, regardless of the
 * metric's underlying type) into a number. Fails loud on a non-numeric,
 * blank, or negative value rather than silently reporting 0 (or fewer than
 * zero) sessions for a row GA4 actually returned data for — `Number("")`
 * and `Number("  ")` both evaluate to the finite number `0`, so blankness is
 * checked explicitly rather than relying on `Number.isFinite` alone.
 */
export function parseGa4MetricValue(metricValue: string): number {
  const parsed = Number(metricValue);
  const isBlank = metricValue.trim() === "";
  if (isBlank || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `GA4 metric value "${metricValue}" is not a non-negative finite number.`,
    );
  }
  return parsed;
}

/**
 * Translates the raw `date`-dimensioned report rows into sorted daily
 * session points. GA4 only returns rows for dates that have at least one
 * session in the requested scope, so a gap day simply has no point here —
 * callers never fabricate a zero for a day GA4 didn't report.
 */
export function toDailySessionPoints(
  rows: Ga4ReportRow[],
): Ga4DailySessionPoint[] {
  return rows
    .map((row) => ({
      date: parseGa4Date(row.dimensionValue),
      sessions: parseGa4MetricValue(row.metricValue),
    }))
    .sort((first, second) => first.date.getTime() - second.date.getTime());
}

/**
 * Sums the `sessions` metric straight across a report's rows, regardless of
 * dimension. Used for the report-level total rather than summing the
 * `date`-dimensioned daily series: GA4's `date` dimension can double-count a
 * session that spans midnight (once on each of the two calendar days it
 * touches), while `sessionDefaultChannelGrouping` is session-scoped and
 * doesn't have that failure mode — so the 30d total this provider reports is
 * derived from the channel-split report, not the daily one, and the two
 * therefore always share the same denominator (see provider.ts's
 * fetchGa4Metrics).
 */
export function sumReportSessions(rows: Ga4ReportRow[]): number {
  return rows.reduce(
    (sum, row) => sum + parseGa4MetricValue(row.metricValue),
    0,
  );
}

// GA4's own `sessionDefaultChannelGrouping` values, collapsed into the
// coarser bucket taxonomy the dashboard currently renders (see
// app/pages/index.vue's "Organic search / Direct / Referral & social" mock
// tiles, and server/db/schema.ts's trafficBreakdown comment: "direct,
// organic, referral, ..."). GA4 can report roughly fifteen distinct
// groupings (Paid Search, Email, Affiliates, Display, ...) with no dashboard
// bucket of their own yet, so anything not explicitly mapped below falls
// into "other" rather than being silently dropped from the split — widening
// this taxonomy is a follow-up once the UI has a slot for paid/email/etc.
export const CHANNEL_BUCKET_DIRECT = "direct";
export const CHANNEL_BUCKET_ORGANIC = "organic";
export const CHANNEL_BUCKET_REFERRAL = "referral";
export const CHANNEL_BUCKET_OTHER = "other";

// A Map, not a plain object literal — GA4's grouping names are external,
// server-supplied strings, and a plain object would resolve a lookup like
// "constructor" or "toString" through Object.prototype to a function value
// instead of falling through to `?? CHANNEL_BUCKET_OTHER`.
const CHANNEL_GROUPING_TO_BUCKET = new Map<string, string>([
  ["Direct", CHANNEL_BUCKET_DIRECT],
  ["Organic Search", CHANNEL_BUCKET_ORGANIC],
  ["Organic Shopping", CHANNEL_BUCKET_ORGANIC],
  ["Referral", CHANNEL_BUCKET_REFERRAL],
  ["Organic Social", CHANNEL_BUCKET_REFERRAL],
  ["Paid Social", CHANNEL_BUCKET_REFERRAL],
]);

export function toChannelBucket(channelGrouping: string): string {
  return (
    CHANNEL_GROUPING_TO_BUCKET.get(channelGrouping) ?? CHANNEL_BUCKET_OTHER
  );
}

function roundToPct(value: number): number {
  const scale = 10 ** PERCENTAGE_DECIMAL_PLACES;
  return Math.round(value * scale) / scale;
}

/**
 * Translates the raw `sessionDefaultChannelGrouping`-dimensioned report rows
 * into this dashboard's bucketed traffic_breakdown percentages. `totalSessions`
 * is passed in rather than re-derived from these rows so it always matches
 * the SAME 30d total the `sessions` metric_snapshot row reports (per
 * server/utils/dashboardShaping.ts's comment on why the split's denominator
 * must be the metric's own total, not just the sessions of channels that
 * happen to appear in this report) — callers should skip calling this
 * entirely when totalSessions is 0, since a percentage split of zero
 * sessions is undefined, not "every channel at 0%". Throws rather than
 * dividing by zero if a caller does anyway: an Infinity/NaN pct would fail
 * the traffic_breakdown_pct_range DB check at insert time instead of here,
 * at the actual mistake.
 */
export function toChannelBreakdown(
  rows: Ga4ReportRow[],
  totalSessions: number,
): Ga4ChannelBreakdown[] {
  if (totalSessions <= 0) {
    throw new Error(
      `toChannelBreakdown requires a positive totalSessions, got ${totalSessions}.`,
    );
  }

  const sessionsByBucket = new Map<string, number>();
  for (const row of rows) {
    const bucket = toChannelBucket(row.dimensionValue);
    const sessions = parseGa4MetricValue(row.metricValue);
    sessionsByBucket.set(
      bucket,
      (sessionsByBucket.get(bucket) ?? 0) + sessions,
    );
  }

  return [...sessionsByBucket.entries()].map(([channel, sessions]) => ({
    channel,
    pct: roundToPct((sessions / totalSessions) * PERCENTAGE_MULTIPLIER),
  }));
}
