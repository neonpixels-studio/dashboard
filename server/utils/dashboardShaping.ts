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
  MetricSeries,
  OverviewMetric,
  SyncSource,
  SyndicationMatrixRow,
  TrafficChannelSplit,
} from "../../shared/types/dashboard";

function toIso(date: Date): string {
  return date.toISOString();
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
// here just fans a flat row list back out per metric/period).
export function latestMetricsBySlug(
  rows: MetricSnapshotRow[],
  slug: string,
): CurrentMetric[] {
  const groups = groupBySlugMetricPeriod(
    rows.filter((row) => row.slug === slug),
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

// Sums the latest value of one (metric, period) across every app that has a
// row for it. Apps with no data are omitted rather than counted as zero —
// per the no-fabricated-numbers rule, a missing metric isn't a real zero.
// Returns value/period/capturedAt all null only when NO app has any data yet.
export function sumLatestMetricAcrossApps(
  rows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
  period: string,
): OverviewMetric {
  const latestPerApp = slugs
    .map((slug) => latestRowForMetric(rows, slug, metric, period))
    .filter((row): row is MetricSnapshotRow => row !== null);

  if (!latestPerApp.length) {
    return { value: null, period: null, capturedAt: null };
  }

  const total = latestPerApp.reduce((sum, row) => sum + row.value, 0);
  const mostRecent = latestPerApp.reduce((latest, row) =>
    row.capturedAt > latest.capturedAt ? row : latest,
  );
  return {
    value: total,
    period: mostRecent.period,
    capturedAt: toIso(mostRecent.capturedAt),
  };
}

// Per-app breakdown of one (metric, period)'s latest value — apps with no
// data are left out of the list entirely (never shown as a zero).
export function metricSplitByApp(
  rows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
  period: string,
): AppMetricSplit[] {
  return slugs.flatMap((slug) => {
    const row = latestRowForMetric(rows, slug, metric, period);
    if (!row) {
      return [];
    }
    return [{ slug, value: row.value }];
  });
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

// Studio-wide channel split for the overview page. Each channel's total is
// divided by the number of apps that have *any* breakdown yet — not by how
// many of them happen to report that specific channel — so an app that
// doesn't report a given channel counts as 0% for it rather than being
// excluded from the average. That keeps the split summing to ~100% across
// channels; excluding it from the denominator per-channel would let two
// apps with disjoint channel sets each average near 100%, on their own,
// summing to ~200% overall.
export function trafficChannelSplitAcrossApps(
  rows: TrafficBreakdownRow[],
  slugs: string[],
): TrafficChannelSplit[] {
  const relevantRows = rows.filter((row) => slugs.includes(row.slug));
  const appsWithData = new Set(relevantRows.map((row) => row.slug));

  if (!appsWithData.size) {
    return [];
  }

  const totalsByChannel = new Map<string, number>();
  relevantRows.forEach((row) => {
    totalsByChannel.set(
      row.channel,
      (totalsByChannel.get(row.channel) ?? 0) + row.pct,
    );
  });

  return [...totalsByChannel.entries()].map(([channel, sum]) => ({
    channel,
    pct: roundTo2(sum / appsWithData.size),
  }));
}

// No sync_status rows at all means nothing has ever polled for this app
// (providers/sync aren't built yet, per the issue) — distinct from every
// integration being healthy.
export function computeAppStatus(
  syncRows: SyncStatusRow[],
  slug: string,
): AppStatus {
  const rowsForSlug = syncRows.filter((row) => row.slug === slug);
  if (!rowsForSlug.length) {
    return { label: "NOT SYNCED", tone: "muted" };
  }

  const failing = rowsForSlug.filter((row) => !row.ok);
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
  configRows: IntegrationConfigRow[],
  syncRows: SyncStatusRow[],
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
        lastRunAt: sync?.lastRunAt ? toIso(sync.lastRunAt) : null,
        lastSuccessAt: sync?.lastSuccessAt ? toIso(sync.lastSuccessAt) : null,
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
      lastRunAt: row.lastRunAt ? toIso(row.lastRunAt) : null,
      lastSuccessAt: row.lastSuccessAt ? toIso(row.lastSuccessAt) : null,
      error: row.error,
    }));
}

// One alert per vendor currently failing to sync for this app.
export function alertsForApp(
  syncRows: SyncStatusRow[],
  slug: string,
): AppAlert[] {
  return syncRows
    .filter((row) => row.slug === slug && !row.ok)
    .map((row) => ({
      slug,
      vendor: row.vendor,
      // `||`, not `??`: a poller-written empty-string error is exactly as
      // uninformative as a missing one, and should fall back the same way.
      message: row.error || `${row.vendor} sync is failing`,
      occurredAt: row.lastRunAt ? toIso(row.lastRunAt) : null,
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
      syncedAt: row.syncedAt ? toIso(row.syncedAt) : null,
    })),
  }));
}
