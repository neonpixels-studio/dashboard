// Pure shaping/aggregation functions over raw DB rows. Nothing here touches
// `db` — every function takes plain arrays (as returned by
// dashboardQueries.ts) and returns a shared/types/dashboard.ts shape, so the
// whole module is testable without any database fake at all.
import type {
  IntegrationConfigRow,
  MetricSnapshotRow,
  SyncStatusRow,
  SyndicationPostRow,
  TrafficBreakdownRow,
} from "./dashboardQueries";
import type {
  AppAlert,
  AppMetricSplit,
  AppStatus,
  CurrentMetric,
  IntegrationEnvironment,
  IntegrationHealth,
  MetricPoint,
  MetricSeries,
  RollupDelta,
  RollupTotal,
  SyncSource,
  SyndicationMatrixRow,
  TrafficChannelSplit,
} from "../../shared/types/dashboard";
import type { PropertySessions } from "../../shared/types/overviewSessions";
import { sentryStatusChip } from "../integrations/sentry/mapping";
import {
  METRIC_FATAL_ISSUES,
  METRIC_OPEN_ISSUES,
  METRIC_SESSIONS,
  PERIOD_30D,
  PERIOD_CURRENT,
  PERIOD_DAILY,
} from "./dashboardMetrics";
import {
  integrationEnvironmentKey,
  type IntegrationEnvironmentMap,
} from "../integrations/credentialEnvironment";

function toIso(date: Date): string {
  return date.toISOString();
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? toIso(date) : null;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

// A metric name alone doesn't identify one series — the schema allows the
// same metric at multiple periods (e.g. `sessions` at "7d" and "30d") — so
// every grouping key includes all three of slug/metric/period.
function metricGroupKey(slug: string, metric: string, period: string): string {
  return `${slug}::${metric}::${period}`;
}

// Vendor is deliberately its own key component, never folded into
// metricGroupKey — see groupVendorBucketsByMetric for why.
function metricVendorGroupKey(
  slug: string,
  metric: string,
  period: string,
  vendor: string,
): string {
  return `${metricGroupKey(slug, metric, period)}::${vendor}`;
}

// `noUncheckedIndexedAccess` makes `rows[0]`/`rows[rows.length - 1]` type as
// possibly-undefined even where a group is known (by construction) to be
// non-empty. These read the first/last element via the no-initial-value
// `reduce` overload instead, which types as `T`, not `T | undefined` —
// making the non-emptiness invariant explicit rather than asserting past it.
function firstOf<T>(rows: T[]): T {
  return rows.reduce((element) => element);
}

function lastOf<T>(rows: T[]): T {
  return rows.reduce((_previous, element) => element);
}

// Groups rows first by (slug, metric, period, vendor) — never mixing two
// vendors' rows in one bucket — then fans those per-vendor buckets back out
// under their shared (slug, metric, period) key. A (metric, period) that
// only one vendor ever reports (the common case: mrr/sessions/open_issues/
// users all come from exactly one provider each) ends up with a single
// single-vendor bucket, so callers that don't care about vendor collisions
// see no change in shape. `posts`, reported by every syndication provider
// (Hashnode/DEV.to/Medium) for the same slug, is the case this exists for:
// without the vendor-first split, one vendor's rows would land in the same
// array as another's and a naive "take the latest" or "flatten into one
// series" would silently drop every vendor but the most recently polled.
function groupVendorBucketsByMetric(
  rows: MetricSnapshotRow[],
): Map<string, MetricSnapshotRow[][]> {
  const vendorBuckets = new Map<string, MetricSnapshotRow[]>();
  for (const row of rows) {
    const key = metricVendorGroupKey(
      row.slug,
      row.metric,
      row.period,
      row.vendor,
    );
    const existing = vendorBuckets.get(key) ?? [];
    existing.push(row);
    vendorBuckets.set(key, existing);
  }

  const metricGroups = new Map<string, MetricSnapshotRow[][]>();
  for (const bucket of vendorBuckets.values()) {
    const { slug, metric, period } = firstOf(bucket);
    const key = metricGroupKey(slug, metric, period);
    const existing = metricGroups.get(key) ?? [];
    existing.push(bucket);
    metricGroups.set(key, existing);
  }
  return metricGroups;
}

// One current-value tile's worth of data from every vendor bucket reporting
// this (slug, metric, period): each vendor's own latest row, summed into one
// total (so Hashnode's 12 posts and DEV.to's 5 both count, rather than one
// overwriting the other), timestamped with whichever vendor polled most
// recently — deliberately consistent with metricRollupWithSplit's cross-app
// "mostRecent" convention (same "freshest contributor sets the timestamp"
// rule, just across vendors instead of apps), not a new choice made here.
// That convention already accepts, at the app level, that a long-broken
// contributor's stale-but-still-included value can ride along under a
// fresh timestamp from whichever *other* contributor just polled; this
// applies the identical tradeoff to vendors rather than introducing a
// second, inconsistent "capturedAt means something different here" rule.
function toCurrentMetric(vendorBuckets: MetricSnapshotRow[][]): CurrentMetric {
  // maxByCapturedAt, not lastOf: unlike fetchLatestMetricSnapshots's own
  // DISTINCT ON output, this function makes no assumption about row order,
  // so picking "the last array element" as a proxy for "the newest row"
  // isn't safe here.
  const latestPerVendor = vendorBuckets.map(maxByCapturedAt);
  const { metric, period } = firstOf(latestPerVendor);
  const mostRecent = maxByCapturedAt(latestPerVendor);

  // A single vendor's own row is returned at its stored precision (up to 4
  // decimal places — see metric_snapshot's `scale: 4`), matching every
  // other single-value read path in this file. Only an actual multi-vendor
  // *sum* goes through roundTo2, the same rounding sumRowsByDay's series
  // points get — floating-point addition (e.g. 1102.3 + 132.26 =
  // 1234.5600000000002) can pick up noise a single row never has.
  if (latestPerVendor.length === 1) {
    return {
      metric,
      period,
      value: mostRecent.value,
      capturedAt: toIso(mostRecent.capturedAt),
    };
  }

  const value = latestPerVendor.reduce((sum, row) => sum + row.value, 0);
  return {
    metric,
    period,
    value: roundTo2(value),
    capturedAt: toIso(mostRecent.capturedAt),
  };
}

// One sparkline's worth of points for this (slug, metric, period). A single
// reporting vendor (the common case) keeps today's exact behavior: one point
// per raw row. More than one vendor (the `posts` case) switches to a
// day-bucketed, carry-forward sum instead of naively flattening — raw rows
// from independently polling vendors don't share timestamps, so
// interleaving them chronologically would plot each vendor's own count in
// turn (a misleading zigzag) rather than the combined total a summed tile
// implies.
function toMetricSeries(vendorBuckets: MetricSnapshotRow[][]): MetricSeries {
  const firstBucket = firstOf(vendorBuckets);
  const { metric, period } = firstOf(firstBucket);

  if (vendorBuckets.length === 1) {
    const points = firstBucket.map((row) => ({
      capturedAt: toIso(row.capturedAt),
      value: row.value,
    }));
    return { metric, period, points };
  }

  return { metric, period, points: combineVendorSeries(vendorBuckets) };
}

// Every UTC calendar day spanned by `vendorBuckets`, inclusive of the
// earliest and latest capturedAt across every vendor. Reuses
// utcDayKeysThrough/minByCapturedAt/maxByCapturedAt, defined further down
// (function declarations hoist, so the earlier call site here is fine).
//
// Known limitation, not yet worth the added complexity to fix (same
// tradeoff rollupDelta's own doc comment carries for apps, just for
// vendors): starting the span at the single earliest row means a day before
// a second vendor's first-ever report only sums the vendor(s) that have
// reported so far, not a fabricated zero for the rest but not the full
// picture either — a vendor onboarding mid-window can read as a jump in the
// combined total rather than the new-contributor noise it actually is.
// Starting the span only once every vendor has reported at least once would
// avoid that, at the cost of truncating away a lone vendor's perfectly good
// earlier history every time a second vendor is added.
function utcDayKeysSpanning(vendorBuckets: MetricSnapshotRow[][]): string[] {
  const allRows = vendorBuckets.flat();
  const earliest = minByCapturedAt(allRows).capturedAt;
  const latest = maxByCapturedAt(allRows).capturedAt;

  const start = new Date(earliest);
  start.setUTCHours(0, 0, 0, 0);
  return utcDayKeysThrough(start, latest);
}

// Sums every vendor's most recently known value as of each day in the
// combined span, carrying each vendor's last value forward across days it
// didn't poll — the multi-vendor equivalent of rollupSeriesAcrossApps, keyed
// by vendor instead of slug. Shares its summing loop with
// rollupSeriesAcrossApps via sumRowsByDay (see that function's doc comment).
function combineVendorSeries(
  vendorBuckets: MetricSnapshotRow[][],
): MetricPoint[] {
  const dayKeys = utcDayKeysSpanning(vendorBuckets);

  // One carry-forward pass per vendor bucket (each O(rows + days), via
  // carryForwardByDay) rather than re-filtering the whole bucket per day —
  // vendor buckets hold raw poll rows, not pre-aggregated daily points, so
  // re-scanning per day (as latestRowOnOrBefore does for
  // rollupSeriesAcrossApps's sparser per-app rows) would be O(days * rows)
  // here.
  const rowsByDay = new Map<string, MetricSnapshotRow[]>(
    dayKeys.map((dayKey) => [dayKey, []]),
  );
  vendorBuckets
    .flatMap((bucket) => carryForwardByDay(bucket, dayKeys))
    .forEach(({ dayKey, row }) => {
      if (!row) {
        return;
      }
      rowsByDay.get(dayKey)?.push(row);
    });

  return sumRowsByDay(dayKeys, (dayKey) => rowsByDay.get(dayKey) ?? []);
}

// carryForwardByDay's single-pass counterpart to latestRowOnOrBefore: for
// each day in `dayKeys` (assumed ascending, as utcDayKeysThrough/
// utcDayKeysSpanning always produce), the most recently known row as of
// that day, without re-filtering `rows` from scratch per day. Sorts once,
// then walks a single pointer forward as `dayKeys` advances. Pairs each
// result with its `dayKey` (rather than returning a bare positional array)
// so callers never need to re-index back into `dayKeys` themselves.
function carryForwardByDay(
  rows: MetricSnapshotRow[],
  dayKeys: string[],
): { dayKey: string; row: MetricSnapshotRow | undefined }[] {
  const ascending = [...rows].sort(
    (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime(),
  );

  let rowIndex = 0;
  let mostRecentSoFar: MetricSnapshotRow | undefined;
  return dayKeys.map((dayKey) => {
    while (rowIndex < ascending.length) {
      const candidate = ascending[rowIndex];
      if (!candidate || toUtcDayKey(candidate.capturedAt) > dayKey) {
        break;
      }
      mostRecentSoFar = candidate;
      rowIndex += 1;
    }
    return { dayKey, row: mostRecentSoFar };
  });
}

// Current value per (metric, period) for one app — the "current stat" tiles.
// Takes rows from fetchLatestMetricSnapshots (already latest-per-vendor;
// grouping here fans a flat row list back out per metric/period, summing
// across vendors — see groupVendorBucketsByMetric/toCurrentMetric).
// PERIOD_DAILY is excluded: unlike every other period, a sync backfills many
// PERIOD_DAILY rows at once (server/integrations/ga4/provider.ts), so
// fetchLatestMetricSnapshots's "latest row per (slug, vendor, metric,
// period)" would otherwise surface as its own current-value tile (today's
// single day of sessions, next to the real sessions/30d tile) instead of
// feeding only the sparkline via metricSeriesBySlug below, which is where it
// belongs.
export function latestMetricsBySlug(
  rows: MetricSnapshotRow[],
  slug: string,
): CurrentMetric[] {
  const groups = groupVendorBucketsByMetric(
    rows.filter((row) => row.slug === slug && row.period !== PERIOD_DAILY),
  );
  return [...groups.values()].map(toCurrentMetric);
}

function vendorKeyOf(row: MetricSnapshotRow): string {
  return metricVendorGroupKey(row.slug, row.metric, row.period, row.vendor);
}

// A vendor whose latest poll predates the series window has no rows in
// `seriesRows` for its (metric, period), yet latestMetricsBySlug still counts
// it in the tile. Seeds one carry-forward row per such vendor from
// `latestRows` (fetchLatestMetricSnapshots, unbounded), so the combined
// sparkline includes every vendor the tile does.
//
// The seed is re-dated to the earliest in-window row of its group, because
// its true timestamp is outside the window and would stretch the sparkline's
// day span back to it; the stale value is only needed as the carried-forward
// baseline. Only latest rows older than that earliest row are seeded. A
// (metric, period) with no in-window rows at all is left alone (no new
// series appears for a metric whose every vendor is stale).
function staleVendorSeedRows(
  seriesRows: MetricSnapshotRow[],
  latestRows: MetricSnapshotRow[],
): MetricSnapshotRow[] {
  const earliestByGroup = new Map(
    [...groupVendorBucketsByMetric(seriesRows)].map(([key, buckets]) => [
      key,
      minByCapturedAt(buckets.flat()).capturedAt,
    ]),
  );
  const knownVendorKeys = new Set(seriesRows.map(vendorKeyOf));

  return latestRows.flatMap((row) => {
    const earliestInWindow = earliestByGroup.get(
      metricGroupKey(row.slug, row.metric, row.period),
    );
    if (!earliestInWindow || knownVendorKeys.has(vendorKeyOf(row))) {
      return [];
    }
    // The two queries run concurrently, so a row committed between them can
    // show up in `latestRows` only; it is in-window, not stale, so skip it
    // (the next request's series query will include it).
    if (row.capturedAt >= earliestInWindow) {
      return [];
    }
    return [{ ...row, capturedAt: earliestInWindow }];
  });
}

// One time series per (metric, period) for one app — the sparkline source
// data. Takes rows from fetchMetricSnapshotSeries (bounded history, the
// SERIES_WINDOW_DAYS window). Optionally takes `latestRows` from
// fetchLatestMetricSnapshots (unbounded latest-per-vendor) so a multi-vendor
// metric keeps a vendor whose last poll fell outside the window, matching
// the vendors latestMetricsBySlug counts in the tile (see
// staleVendorSeedRows). Omitting it keeps the window-only behavior.
export function metricSeriesBySlug(
  rows: MetricSnapshotRow[],
  slug: string,
  latestRows: MetricSnapshotRow[] = [],
): MetricSeries[] {
  const seriesRows = rows.filter((row) => row.slug === slug);
  const seedRows = staleVendorSeedRows(
    seriesRows,
    latestRows.filter((row) => row.slug === slug),
  );
  const groups = groupVendorBucketsByMetric([...seriesRows, ...seedRows]);
  return [...groups.values()].map(toMetricSeries);
}

// Takes rows from fetchLatestMetricSnapshots, which is latest-per-(slug,
// vendor, metric, period) — `matches` holds more than one row per app only
// if more than one vendor reports the same metric/period (today, only
// `posts` does; see groupVendorBucketsByMetric). This function picks the
// single most recent row (maxByCapturedAt, not a summed total) rather than
// summing across vendors the way toCurrentMetric does — deliberately, since
// none of its current callers (mrr/active_subscribers/sessions/open_issues,
// all single-vendor) need a sum. A caller that starts passing a
// multi-vendor metric through metricRollupWithSplit/
// trafficChannelSplitAcrossApps should route it through
// groupVendorBucketsByMetric-based summation instead of this function.
function latestRowForMetric(
  rows: MetricSnapshotRow[],
  slug: string,
  metric: string,
  period: string,
): MetricSnapshotRow | null {
  const matches = rows.filter(
    (row) =>
      row.slug === slug && row.metric === metric && row.period === period,
  );
  if (!matches.length) {
    return null;
  }
  return maxByCapturedAt(matches);
}

// The overview rollup for one (metric, period): the sum across every app
// that has a row for it, plus that same per-app breakdown — the two always
// travel together on OverviewResponse (`mrr`, `activeSubscribers`,
// `openIssues` all pair a total with a `byApp` list), and computing them
// together means every app's latest row is looked up once, not twice.
// Apps with no data are omitted from both rather than counted as zero — per
// the no-fabricated-numbers rule, a missing metric isn't a real zero.
// value/period/capturedAt are all null only when NO app has any data yet.
export function metricRollupWithSplit(
  rows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
  period: string,
): RollupTotal & { byApp: AppMetricSplit[] } {
  const latestPerApp = slugs.flatMap((slug) => {
    const row = latestRowForMetric(rows, slug, metric, period);
    if (!row) {
      return [];
    }
    return [{ slug, row }];
  });

  const byApp = latestPerApp.map((entry) => ({
    slug: entry.slug,
    value: entry.row.value,
  }));

  if (!latestPerApp.length) {
    return { value: null, period: null, capturedAt: null, byApp };
  }

  const total = latestPerApp.reduce((sum, entry) => sum + entry.row.value, 0);
  const mostRecent = latestPerApp.reduce((latest, entry) =>
    entry.row.capturedAt > latest.row.capturedAt ? entry : latest,
  ).row;

  return {
    value: total,
    period: mostRecent.period,
    capturedAt: toIso(mostRecent.capturedAt),
    byApp,
  };
}

// Default comparison window for the overview rollup sparkline/deltas —
// matches the "over the last 30 days" framing the MRR sparkline's aria-label
// already used before this was wired to real data.
export const ROLLUP_WINDOW_DAYS = 30;

// Rounds down to the start of the UTC day `windowDays - 1` days before
// `now`, so "windowDays=2" genuinely means "today and yesterday" (two whole
// calendar days) rather than "the last 48 wall-clock hours" — the latter
// would let a call made at 23:59 pull in a third calendar day's rows and
// silently widen the window the caller asked for.
function windowStart(windowDays: number, now: Date): Date {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function groupBySlug(
  rows: MetricSnapshotRow[],
): Map<string, MetricSnapshotRow[]> {
  const bySlug = new Map<string, MetricSnapshotRow[]>();
  rows.forEach((row) => {
    const existing = bySlug.get(row.slug) ?? [];
    existing.push(row);
    bySlug.set(row.slug, existing);
  });
  return bySlug;
}

// Every UTC calendar day from `start` through `end`, inclusive — the day
// axis rollupSeriesAcrossApps sums across, one entry per day regardless of
// whether any row actually landed that day.
function utcDayKeysThrough(start: Date, end: Date): string[] {
  const dayKeys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dayKeys.push(toUtcDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dayKeys;
}

// The row with the latest capturedAt in a non-empty list — like lastOf, but
// doesn't assume the list is already sorted ascending. rollupSeriesAcrossApps
// gets its rows from fetchMetricSnapshotSeries, which does sort ascending
// today, but "the caller happens to sort it" isn't a contract this function
// should have to rely on to pick the right row. Also used by
// combineVendorSeries's cross-vendor day bucketing, above — same need, just
// picking the freshest row among a vendor's rows instead of an app's.
function maxByCapturedAt(rows: MetricSnapshotRow[]): MetricSnapshotRow {
  return rows.reduce((latest, row) =>
    row.capturedAt > latest.capturedAt ? row : latest,
  );
}

// The mirror image of maxByCapturedAt — used by utcDayKeysSpanning to find
// where a combined multi-vendor day range starts.
function minByCapturedAt(rows: MetricSnapshotRow[]): MetricSnapshotRow {
  return rows.reduce((earliest, row) =>
    row.capturedAt < earliest.capturedAt ? row : earliest,
  );
}

// One entity's (app's, or — via combineVendorSeries above — vendor's) most
// recently known row as of the end of `dayKey` — the "carry forward"
// rollupSeriesAcrossApps needs so a day an app simply didn't poll still
// counts that app's last real value instead of silently dropping it from
// that day's sum (see the function's own doc comment for why dropping it is
// wrong, not just conservative). Considers rows from before the series'
// display window too (whatever the caller passed in) — otherwise the
// window's first days would understate the total for any entity whose most
// recent poll happens to land just outside it, which is common with the
// "yesterday vs. today" 2-day window and not just a rare once-in-a-month
// edge case.
function latestRowOnOrBefore(
  rowsForEntity: MetricSnapshotRow[],
  dayKey: string,
): MetricSnapshotRow | undefined {
  const rowsOnOrBefore = rowsForEntity.filter(
    (row) => toUtcDayKey(row.capturedAt) <= dayKey,
  );
  if (!rowsOnOrBefore.length) {
    return undefined;
  }
  return maxByCapturedAt(rowsOnOrBefore);
}

// One point per day in `dayKeys`, summing whatever rows
// `latestRowsForDay` returns for that day (each contributing entity's most
// recently known row as of it) — skipping a day with no contributing rows
// rather than fabricating a zero. Shared by rollupSeriesAcrossApps
// (entities = apps) and combineVendorSeries (entities = vendors within one
// app's metric): both are "sum independently-polling sources' latest known
// value per day, carrying stale ones forward," differing only in which
// entity list they iterate to build that day's row set.
function sumRowsByDay(
  dayKeys: string[],
  latestRowsForDay: (dayKey: string) => MetricSnapshotRow[],
): MetricPoint[] {
  return dayKeys.flatMap((dayKey) => {
    const rowsToday = latestRowsForDay(dayKey);
    if (!rowsToday.length) {
      return [];
    }
    const total = rowsToday.reduce((sum, row) => sum + row.value, 0);
    return [{ capturedAt: `${dayKey}T00:00:00.000Z`, value: roundTo2(total) }];
  });
}

// One rollup point per UTC calendar day in the display window, summing each
// app's most recently known value AS OF that day — not just rows that
// happen to land on that exact day, and not just rows inside the window
// either. Without carrying a value forward from an app's last real poll
// (wherever it falls), a day where only some apps happened to poll would
// understate the true total and read as a real swing rather than the
// polling-cadence noise it actually is; with it, the series' last point
// always agrees with metricRollupWithSplit's headline total (both are "sum
// of each app's latest known value"), which is what a delta/sparkline is
// implicitly compared against. A day before ANY app in `slugs` has ever
// reported this metric/period at all isn't a point — still never a
// fabricated zero, just genuinely unknown.
//
// `windowDays` only controls which days become POINTS in the output, never
// which rows are eligible to seed one — a row from well before the window
// can still be the most recent thing known about an app on the window's
// first day. How far back a stale app's last poll can be and still count
// is bounded by the caller's own query (fetchMetricSnapshotSeries' fixed
// lookback), not by anything here.
//
// groupBySlug (like latestRowForMetric) assumes exactly one vendor
// contributes to `metric`/`period` per app — true for every metric routed
// through the overview rollup today (mrr/active_subscribers/sessions/
// open_issues, all single-vendor). A future multi-vendor metric routed
// through here would need the same per-vendor-bucket-then-sum treatment
// groupVendorBucketsByMetric/combineVendorSeries give `posts`, not this
// per-app-only grouping.
export function rollupSeriesAcrossApps(
  rows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
  period: string,
  windowDays: number = ROLLUP_WINDOW_DAYS,
  now: Date = new Date(),
): MetricPoint[] {
  const matching = rows.filter(
    (row) =>
      slugs.includes(row.slug) &&
      row.metric === metric &&
      row.period === period,
  );
  if (!matching.length) {
    return [];
  }

  const rowsBySlug = groupBySlug(matching);
  const start = windowStart(windowDays, now);
  const dayKeys = utcDayKeysThrough(start, now);

  return sumRowsByDay(dayKeys, (dayKey) =>
    slugs.flatMap((slug) => {
      const row = latestRowOnOrBefore(rowsBySlug.get(slug) ?? [], dayKey);
      return row ? [row] : [];
    }),
  );
}

// Change from the earliest to the latest point of a rollup series — the
// "▲ 8.2%"/"▲ 14" pairing next to every overview tile's headline value.
// Needs at least two points to describe a change; a single-point (or empty)
// series has nothing to compare against, so it's null rather than a
// fabricated zero.
//
// Known limitation, not yet worth the added complexity to fix: this
// compares whichever apps happened to have data on the first vs. last day
// of the window, not a fixed set. A brand-new app's first sync mid-window
// (or one app dropping out) shifts the day-to-day *composition* of the sum,
// which this reports as pure growth/decline — same tradeoff
// metricRollupWithSplit's single-point total already carries, just visible
// here as a delta instead of a jump between two independent requests.
// Confining the comparison to apps present on both ends would need each
// day's own per-app breakdown, not just its total — a bigger change than
// this pass covers.
export function rollupDelta(series: MetricPoint[]): RollupDelta | null {
  if (series.length < 2) {
    return null;
  }
  const first = firstOf(series).value;
  const last = lastOf(series).value;
  const value = roundTo2(last - first);
  return {
    value,
    pct: first !== 0 ? roundTo2((value / first) * 100) : null,
  };
}

// Channel split for a single app's detail page. Takes rows from
// fetchLatestTrafficBreakdowns, which is already exactly one row per
// (slug, channel) — no further grouping needed.
export function trafficChannelSplitForApp(
  rows: TrafficBreakdownRow[],
  slug: string,
): TrafficChannelSplit[] {
  return rows
    .filter((row) => row.slug === slug)
    .map((row) => ({ channel: row.channel, pct: row.pct }));
}

// Studio-wide channel split for the overview page, weighted by each app's
// latest 30d sessions — a 12,000-session app should move the split far more
// than a 300-session one. A flat average of percentages would let a small
// property's mix count exactly as much as the studio's biggest.
// Apps with a breakdown but no sessions metric yet are excluded from the
// numerator entirely (not treated as zero weight, which reads as "reported
// zero sessions"). `totalSessions` — the SAME total `sessions30d.value`
// ships — is the denominator, not just the sessions of apps that happen to
// have a breakdown too: an app whose sessions are known but whose GA4
// breakdown hasn't synced yet is real, unattributed traffic, and excluding
// it from the denominator would inflate the covered channels' percentages
// to imply full attribution. Percentages therefore sum to less than 100
// whenever some sessions aren't yet attributed to any channel — that's
// intentional, not a bug.
export function trafficChannelSplitAcrossApps(
  breakdownRows: TrafficBreakdownRow[],
  metricRows: MetricSnapshotRow[],
  slugs: string[],
  totalSessions: number,
): TrafficChannelSplit[] {
  if (!totalSessions) {
    return [];
  }

  const weightedApps = slugs.flatMap((slug) => {
    const sessionsRow = latestRowForMetric(
      metricRows,
      slug,
      METRIC_SESSIONS,
      PERIOD_30D,
    );
    const breakdownForApp = breakdownRows.filter((row) => row.slug === slug);
    if (!sessionsRow || !breakdownForApp.length) {
      return [];
    }
    return [{ sessions: sessionsRow.value, breakdownForApp }];
  });

  const weightedTotalsByChannel = new Map<string, number>();
  weightedApps
    .flatMap((app) =>
      app.breakdownForApp.map((row) => ({
        channel: row.channel,
        weightedSessions: (row.pct / 100) * app.sessions,
      })),
    )
    .forEach(({ channel, weightedSessions }) => {
      weightedTotalsByChannel.set(
        channel,
        (weightedTotalsByChannel.get(channel) ?? 0) + weightedSessions,
      );
    });

  return [...weightedTotalsByChannel.entries()].map(
    ([channel, weightedSessions]) => ({
      channel,
      pct: roundTo2((weightedSessions / totalSessions) * 100),
    }),
  );
}

// Drops a vendor's sync_status row once it's been explicitly disabled in
// integration_config — nothing polls a disabled vendor, so its last (maybe
// failing) row would otherwise report as a permanent issue with no way to
// clear it short of editing the database. A vendor with no config row at all
// (e.g. a free-text source like `github` that was never a toggleable
// integration) still counts — only an explicit `enabled: false` suppresses.
function activeSyncRowsForApp(
  syncRows: SyncStatusRow[],
  configRows: IntegrationConfigRow[],
  slug: string,
): SyncStatusRow[] {
  return syncRows
    .filter((row) => row.slug === slug)
    .filter((row) => {
      const config = configRows.find(
        (configRow) =>
          configRow.slug === slug && configRow.vendor === row.vendor,
      );
      return config ? config.enabled : true;
    });
}

const SENTRY_VENDOR = "sentry";

function latestSentryValue(
  metricRows: MetricSnapshotRow[],
  slug: string,
  metric: string,
): number | null {
  const matches = metricRows.filter(
    (row) =>
      row.slug === slug &&
      row.vendor === SENTRY_VENDOR &&
      row.metric === metric &&
      row.period === PERIOD_CURRENT,
  );
  if (!matches.length) {
    return null;
  }
  return maxByCapturedAt(matches).value;
}

// Null when Sentry hasn't reported both counts for this app, so an app with
// no Sentry data (grimicorn.dev, neonpixels.dev, or not yet synced) keeps its
// sync-health chip rather than a fabricated "OK".
function sentryChipForApp(
  metricRows: MetricSnapshotRow[],
  slug: string,
): AppStatus | null {
  const openIssuesCount = latestSentryValue(
    metricRows,
    slug,
    METRIC_OPEN_ISSUES,
  );
  const fatalIssuesCount = latestSentryValue(
    metricRows,
    slug,
    METRIC_FATAL_ISSUES,
  );
  if (openIssuesCount === null || fatalIssuesCount === null) {
    return null;
  }
  return sentryStatusChip(openIssuesCount, fatalIssuesCount);
}

// No *active* sync_status rows at all means nothing has ever polled for this
// app (providers/sync aren't built yet, per the issue, or every configured
// vendor has been disabled) — distinct from every integration being healthy.
// Failing syncs (danger) always win, since stale data makes any Sentry chip
// untrustworthy; only when every sync is healthy does the Sentry issue chip
// replace the generic LIVE label.
export function computeAppStatus(
  syncRows: SyncStatusRow[],
  configRows: IntegrationConfigRow[],
  slug: string,
  metricRows: MetricSnapshotRow[] = [],
): AppStatus {
  const activeRows = activeSyncRowsForApp(syncRows, configRows, slug);
  if (!activeRows.length) {
    return { label: "NOT SYNCED", tone: "muted" };
  }

  const failing = activeRows.filter((row) => !row.ok);
  if (!failing.length) {
    return sentryChipForApp(metricRows, slug) ?? { label: "LIVE", tone: "ok" };
  }

  const count = failing.length;
  return { label: `${count} ISSUE${count === 1 ? "" : "S"}`, tone: "danger" };
}

function environmentFor(
  environments: IntegrationEnvironmentMap,
  slug: string,
  vendor: string,
): IntegrationEnvironment | null {
  return environments.get(integrationEnvironmentKey(slug, vendor)) ?? null;
}

// Every configured integration for the app, joined with its latest
// sync_status row when one exists. `ok`/timestamps/`error` are all null for
// a vendor that's configured but has never been polled.
export function integrationHealthForApp(
  syncRows: SyncStatusRow[],
  configRows: IntegrationConfigRow[],
  slug: string,
  environments: IntegrationEnvironmentMap = new Map(),
): IntegrationHealth[] {
  return configRows
    .filter((config) => config.slug === slug)
    .map((config) => {
      const sync = syncRows.find(
        (row) => row.slug === slug && row.vendor === config.vendor,
      );
      return {
        vendor: config.vendor,
        enabled: config.enabled,
        environment: environmentFor(environments, slug, config.vendor),
        ok: sync?.ok ?? null,
        lastRunAt: toIsoOrNull(sync?.lastRunAt ?? null),
        lastSuccessAt: toIsoOrNull(sync?.lastSuccessAt ?? null),
        error: sync?.error ?? null,
      };
    });
}

// Every vendor that has ever synced for this app (whether or not it's still
// enabled in integration_config) — the "sources" footer.
export function syncSourcesForApp(
  syncRows: SyncStatusRow[],
  slug: string,
  environments: IntegrationEnvironmentMap = new Map(),
): SyncSource[] {
  return syncRows
    .filter((row) => row.slug === slug)
    .map((row) => ({
      vendor: row.vendor,
      environment: environmentFor(environments, slug, row.vendor),
      ok: row.ok,
      lastRunAt: toIsoOrNull(row.lastRunAt),
      lastSuccessAt: toIsoOrNull(row.lastSuccessAt),
      error: row.error,
    }));
}

// One alert per vendor currently failing to sync for this app, excluding any
// vendor that's been explicitly disabled since its last (failing) poll —
// see activeSyncRowsForApp.
export function alertsForApp(
  syncRows: SyncStatusRow[],
  configRows: IntegrationConfigRow[],
  slug: string,
): AppAlert[] {
  return activeSyncRowsForApp(syncRows, configRows, slug)
    .filter((row) => !row.ok)
    .map((row) => ({
      slug,
      vendor: row.vendor,
      // `||`, not `??`: a poller-written empty-string error is exactly as
      // uninformative as a missing one, and should fall back the same way.
      message: row.error || `${row.vendor} sync is failing`,
      occurredAt: toIsoOrNull(row.lastRunAt),
    }));
}

// Global "last synced" timestamp: the most recent successful sync across
// whatever sync_status rows were fetched (callers scope the fetch to either
// every app, for the overview, or one app, for the detail page).
export function latestSyncedAt(syncRows: SyncStatusRow[]): string | null {
  const successTimes = syncRows
    .map((row) => row.lastSuccessAt)
    .filter((date): date is Date => date !== null);

  if (!successTimes.length) {
    return null;
  }

  const mostRecent = successTimes.reduce((latest, date) =>
    date > latest ? date : latest,
  );
  return toIso(mostRecent);
}

// Groups an app's syndication_post rows into one matrix row per local post,
// each carrying its per-platform cross-post status.
export function syndicationMatrixForApp(
  posts: SyndicationPostRow[],
): SyndicationMatrixRow[] {
  const byPostRef = new Map<string, SyndicationPostRow[]>();
  for (const post of posts) {
    const existing = byPostRef.get(post.postRef) ?? [];
    existing.push(post);
    byPostRef.set(post.postRef, existing);
  }

  return [...byPostRef.entries()].map(([postRef, rows]) => ({
    postRef,
    cells: rows.map((row) => ({
      platform: row.platform,
      status: row.status,
      syncedAt: toIsoOrNull(row.syncedAt),
    })),
  }));
}

// Cap on how many daily points a property's chart series carries — the
// overview chart is labelled "30 days", but the series window the rows come
// from (SERIES_WINDOW_DAYS) is wider. GA4 backfills one `daily` row per day,
// so "the last N points" is the last N days.
export const SESSIONS_CHART_DAYS = 30;

function isSessionsFor(period: string) {
  return (entry: { metric: string; period: string }) =>
    entry.metric === METRIC_SESSIONS && entry.period === period;
}

// One property's slice of the overview sessions chart: its daily series plus
// the 30-day total/delta shown beside it. The total comes from the unbounded
// latest-per-metric rows (so it matches the top rollup tile and never drops
// a stale-but-real value), the series and delta from the bounded history.
export function sessionsForApp(
  latestRows: MetricSnapshotRow[],
  seriesRows: MetricSnapshotRow[],
  slug: string,
): PropertySessions {
  const series = metricSeriesBySlug(seriesRows, slug);
  const dailyPoints = series.find(isSessionsFor(PERIOD_DAILY))?.points ?? [];
  const rollingPoints = series.find(isSessionsFor(PERIOD_30D))?.points ?? [];
  const total30d = latestMetricsBySlug(latestRows, slug).find(
    isSessionsFor(PERIOD_30D),
  );

  return {
    slug,
    daily: dailyPoints.slice(-SESSIONS_CHART_DAYS),
    total30d: total30d?.value ?? null,
    delta: rollupDelta(rollingPoints),
  };
}
