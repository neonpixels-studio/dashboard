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
  IntegrationHealth,
  MetricPoint,
  MetricSeries,
  RollupDelta,
  RollupTotal,
  SyncSource,
  SyndicationMatrixRow,
  TrafficChannelSplit,
} from "../../shared/types/dashboard";
import { METRIC_SESSIONS, PERIOD_30D, PERIOD_DAILY } from "./dashboardMetrics";

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

// Groups rows by (slug, metric, period), preserving whatever order they
// arrive in (ascending capturedAt, from fetchMetricSnapshotSeries/
// fetchLatestMetricSnapshots).
function groupBySlugMetricPeriod(
  rows: MetricSnapshotRow[],
): Map<string, MetricSnapshotRow[]> {
  const groups = new Map<string, MetricSnapshotRow[]>();
  for (const row of rows) {
    const key = metricGroupKey(row.slug, row.metric, row.period);
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }
  return groups;
}

function toCurrentMetric(rowsForMetric: MetricSnapshotRow[]): CurrentMetric {
  const latest = lastOf(rowsForMetric);
  return {
    metric: latest.metric,
    period: latest.period,
    value: latest.value,
    capturedAt: toIso(latest.capturedAt),
  };
}

function toMetricSeries(rowsForMetric: MetricSnapshotRow[]): MetricSeries {
  const { metric, period } = firstOf(rowsForMetric);
  return {
    metric,
    period,
    points: rowsForMetric.map((row) => ({
      capturedAt: toIso(row.capturedAt),
      value: row.value,
    })),
  };
}

// Current value per (metric, period) for one app — the "current stat" tiles.
// Takes rows from fetchLatestMetricSnapshots (already latest-only; grouping
// here just fans a flat row list back out per metric/period). PERIOD_DAILY
// is excluded: unlike every other period, a sync backfills many PERIOD_DAILY
// rows at once (server/integrations/ga4/provider.ts), so
// fetchLatestMetricSnapshots's "latest row per (slug, metric, period)" would
// otherwise surface as its own current-value tile (today's single day of
// sessions, next to the real sessions/30d tile) instead of feeding only the
// sparkline via metricSeriesBySlug below, which is where it belongs.
export function latestMetricsBySlug(
  rows: MetricSnapshotRow[],
  slug: string,
): CurrentMetric[] {
  const groups = groupBySlugMetricPeriod(
    rows.filter((row) => row.slug === slug && row.period !== PERIOD_DAILY),
  );
  return [...groups.values()].map(toCurrentMetric);
}

// One time series per (metric, period) for one app — the sparkline source
// data. Takes rows from fetchMetricSnapshotSeries (bounded history).
export function metricSeriesBySlug(
  rows: MetricSnapshotRow[],
  slug: string,
): MetricSeries[] {
  const groups = groupBySlugMetricPeriod(
    rows.filter((row) => row.slug === slug),
  );
  return [...groups.values()].map(toMetricSeries);
}

// Takes rows from fetchLatestMetricSnapshots, so `matches` holds at most one
// row per app once `period` is pinned down — `lastOf` is defensive, not load
// bearing.
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
  return lastOf(matches);
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

function appDayKey(slug: string, date: Date): string {
  return `${slug}::${toUtcDayKey(date)}`;
}

// One rollup point per UTC calendar day, summing every app's latest row for
// that day — the studio-wide counterpart to a single app's
// metricSeriesBySlug. A day where only some apps polled sums only what's
// known for that day (never forward-filled or backfilled with a fabricated
// number), matching the "no data" rule the rest of this module follows: a
// day with zero rows across every app simply isn't a point in the series.
//
// Collapses to one row per (app, day) before summing: a "current"/"30d" row
// is already that app's full total as of its own capturedAt, not an
// increment, so a poller that runs more than once a day must contribute
// its latest value for that day exactly once — summing every row it wrote
// that day would double (or triple) count the same total.
export function rollupSeriesAcrossApps(
  rows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
  period: string,
  windowDays: number = ROLLUP_WINDOW_DAYS,
  now: Date = new Date(),
): MetricPoint[] {
  const start = windowStart(windowDays, now);
  const matching = rows.filter(
    (row) =>
      slugs.includes(row.slug) &&
      row.metric === metric &&
      row.period === period &&
      row.capturedAt >= start,
  );

  const latestPerAppDay = new Map<string, MetricSnapshotRow>();
  matching.forEach((row) => {
    const key = appDayKey(row.slug, row.capturedAt);
    const existing = latestPerAppDay.get(key);
    if (!existing || row.capturedAt > existing.capturedAt) {
      latestPerAppDay.set(key, row);
    }
  });

  const totalsByDay = new Map<string, { capturedAt: Date; value: number }>();
  latestPerAppDay.forEach((row) => {
    const dayKey = toUtcDayKey(row.capturedAt);
    const existing = totalsByDay.get(dayKey);
    totalsByDay.set(dayKey, {
      capturedAt:
        existing && existing.capturedAt > row.capturedAt
          ? existing.capturedAt
          : row.capturedAt,
      value: (existing?.value ?? 0) + row.value,
    });
  });

  return [...totalsByDay.entries()]
    .sort(([dayKeyA], [dayKeyB]) => (dayKeyA < dayKeyB ? -1 : 1))
    .map(([, day]) => ({
      capturedAt: toIso(day.capturedAt),
      value: day.value,
    }));
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

// No *active* sync_status rows at all means nothing has ever polled for this
// app (providers/sync aren't built yet, per the issue, or every configured
// vendor has been disabled) — distinct from every integration being healthy.
export function computeAppStatus(
  syncRows: SyncStatusRow[],
  configRows: IntegrationConfigRow[],
  slug: string,
): AppStatus {
  const activeRows = activeSyncRowsForApp(syncRows, configRows, slug);
  if (!activeRows.length) {
    return { label: "NOT SYNCED", tone: "muted" };
  }

  const failing = activeRows.filter((row) => !row.ok);
  if (!failing.length) {
    return { label: "LIVE", tone: "ok" };
  }

  const count = failing.length;
  return { label: `${count} ISSUE${count === 1 ? "" : "S"}`, tone: "danger" };
}

// Every configured integration for the app, joined with its latest
// sync_status row when one exists. `ok`/timestamps/`error` are all null for
// a vendor that's configured but has never been polled.
export function integrationHealthForApp(
  syncRows: SyncStatusRow[],
  configRows: IntegrationConfigRow[],
  slug: string,
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
): SyncSource[] {
  return syncRows
    .filter((row) => row.slug === slug)
    .map((row) => ({
      vendor: row.vendor,
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
