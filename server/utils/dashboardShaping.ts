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

function metricGroupKey(slug: string, metric: string): string {
  return `${slug}::${metric}`;
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

// Groups rows by (slug, metric), preserving the ascending capturedAt order
// they arrive in from fetchMetricSnapshots — mirrors the composite index the
// schema defines for exactly this access pattern.
function groupBySlugAndMetric(
  rows: MetricSnapshotRow[],
): Map<string, MetricSnapshotRow[]> {
  const groups = new Map<string, MetricSnapshotRow[]>();
  for (const row of rows) {
    const key = metricGroupKey(row.slug, row.metric);
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

// Latest value per metric for one app — the "current stat" tiles.
export function latestMetricsBySlug(
  rows: MetricSnapshotRow[],
  slug: string,
): CurrentMetric[] {
  const groups = groupBySlugAndMetric(rows.filter((row) => row.slug === slug));
  return [...groups.values()].map(toCurrentMetric);
}

// One time series per metric for one app — the sparkline source data.
export function metricSeriesBySlug(
  rows: MetricSnapshotRow[],
  slug: string,
): MetricSeries[] {
  const groups = groupBySlugAndMetric(rows.filter((row) => row.slug === slug));
  return [...groups.values()].map(toMetricSeries);
}

function latestRowForMetric(
  rows: MetricSnapshotRow[],
  slug: string,
  metric: string,
): MetricSnapshotRow | null {
  const matches = rows.filter(
    (row) => row.slug === slug && row.metric === metric,
  );
  if (!matches.length) {
    return null;
  }
  return lastOf(matches);
}

// Sums the latest value of `metric` across every app that has at least one
// row for it. Apps with no data are omitted rather than counted as zero —
// per the no-fabricated-numbers rule, a missing metric isn't a real zero.
// Returns value/period/capturedAt all null only when NO app has any data yet.
export function sumLatestMetricAcrossApps(
  rows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
): OverviewMetric {
  const latestPerApp = slugs
    .map((slug) => latestRowForMetric(rows, slug, metric))
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

// Per-app breakdown of one metric's latest value — apps with no data are
// left out of the list entirely (never shown as a zero).
export function metricSplitByApp(
  rows: MetricSnapshotRow[],
  slugs: string[],
  metric: string,
): AppMetricSplit[] {
  return slugs.flatMap((slug) => {
    const row = latestRowForMetric(rows, slug, metric);
    if (!row) {
      return [];
    }
    return [{ slug, value: row.value }];
  });
}

// The most recent traffic_breakdown rows for one app — every channel shares
// the same capturedAt from that app's last GA4 sync.
function latestBreakdownRowsForSlug(
  rows: TrafficBreakdownRow[],
  slug: string,
): TrafficBreakdownRow[] {
  const forSlug = rows.filter((row) => row.slug === slug);
  if (!forSlug.length) {
    return [];
  }
  const mostRecentRow = forSlug.reduce((latest, row) =>
    row.capturedAt > latest.capturedAt ? row : latest,
  );
  return forSlug.filter(
    (row) => row.capturedAt.getTime() === mostRecentRow.capturedAt.getTime(),
  );
}

// Channel split for a single app's detail page — straight from its latest
// traffic_breakdown rows, no aggregation.
export function trafficChannelSplitForApp(
  rows: TrafficBreakdownRow[],
  slug: string,
): TrafficChannelSplit[] {
  return latestBreakdownRowsForSlug(rows, slug).map((row) => ({
    channel: row.channel,
    pct: row.pct,
  }));
}

// Studio-wide channel split for the overview page: a flat average of each
// app's latest per-channel pct across every app that has a breakdown yet.
// This weighs every app equally regardless of traffic volume — a
// session-weighted average would be more accurate and is a reasonable
// follow-up once real GA4 data is flowing.
export function trafficChannelSplitAcrossApps(
  rows: TrafficBreakdownRow[],
  slugs: string[],
): TrafficChannelSplit[] {
  const rowsWithData = slugs
    .map((slug) => latestBreakdownRowsForSlug(rows, slug))
    .filter((appRows) => appRows.length > 0)
    .flat();

  if (!rowsWithData.length) {
    return [];
  }

  const totalsByChannel = new Map<string, { sum: number; count: number }>();
  rowsWithData.forEach((row) => {
    const existing = totalsByChannel.get(row.channel) ?? { sum: 0, count: 0 };
    totalsByChannel.set(row.channel, {
      sum: existing.sum + row.pct,
      count: existing.count + 1,
    });
  });

  return [...totalsByChannel.entries()].map(([channel, { sum, count }]) => ({
    channel,
    pct: roundTo2(sum / count),
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
      message: row.error ?? `${row.vendor} sync is failing`,
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
