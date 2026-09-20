// Thin, isolated data-access layer for the read-side dashboard endpoints.
// Every function takes `db` as its first argument (never calls `useDb()`
// itself) so handlers stay wired to the real Neon connection while tests
// exercise these against a fake `db` — same pattern as
// server/db/seed.ts:seedIntegrationConfig. All shaping/aggregation logic
// lives in dashboardShaping.ts, which operates on plain row arrays and needs
// no `db` fake at all.
import { and, asc, desc, eq, gte, inArray, max, or } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/neon-http";
import type * as schema from "../db/schema";
import {
  integrationConfig,
  metricSnapshot,
  syncStatus,
  syndicationPost,
  trafficBreakdown,
} from "../db/schema";

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type MetricSnapshotRow = InferSelectModel<typeof metricSnapshot>;
export type TrafficBreakdownRow = InferSelectModel<typeof trafficBreakdown>;
export type SyndicationPostRow = InferSelectModel<typeof syndicationPost>;
export type SyncStatusRow = InferSelectModel<typeof syncStatus>;
export type IntegrationConfigRow = InferSelectModel<typeof integrationConfig>;

// Every fetch below is scoped to a list of slugs; an empty list means "no
// apps configured yet" rather than "no filter", so every function short
// circuits before touching the db instead of running a query that (with an
// empty `inArray`) some drivers turn into a full-table scan.
async function forSlugs<Row>(
  slugs: string[],
  run: () => Promise<Row[]>,
): Promise<Row[]> {
  if (!slugs.length) {
    return [];
  }
  return run();
}

// The current-value tiles and rollups need the single latest row per
// (slug, metric, period) — unbounded, so a vendor that's been broken (or
// simply unpolled) for longer than any fixed window doesn't silently vanish
// from a sum with no null and no indication anything was excluded. Postgres
// `DISTINCT ON` is exactly this query, and the ORDER BY below matches the
// DISTINCT ON columns (required) before breaking ties on the newest capture.
export function fetchLatestMetricSnapshots(
  db: DrizzleDb,
  slugs: string[],
): Promise<MetricSnapshotRow[]> {
  return forSlugs(slugs, () =>
    db
      .selectDistinctOn([
        metricSnapshot.slug,
        metricSnapshot.metric,
        metricSnapshot.period,
      ])
      .from(metricSnapshot)
      .where(inArray(metricSnapshot.slug, slugs))
      .orderBy(
        metricSnapshot.slug,
        metricSnapshot.metric,
        metricSnapshot.period,
        desc(metricSnapshot.capturedAt),
      ),
  );
}

// Sparklines draw from a bounded history instead: wide enough to always
// contain several points per (slug, metric, period) even if a poller misses
// a run, without pulling unbounded history as rows accumulate. This is only
// for the chart series — current-value tiles/rollups use
// fetchLatestMetricSnapshots (unbounded) so they never drop stale-but-real
// data.
export const SERIES_WINDOW_DAYS = 60;

export function seriesWindowStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - SERIES_WINDOW_DAYS);
  return start;
}

export function fetchMetricSnapshotSeries(
  db: DrizzleDb,
  slugs: string[],
): Promise<MetricSnapshotRow[]> {
  return forSlugs(slugs, () =>
    db
      .select()
      .from(metricSnapshot)
      .where(
        and(
          inArray(metricSnapshot.slug, slugs),
          gte(metricSnapshot.capturedAt, seriesWindowStart()),
        ),
      )
      .orderBy(asc(metricSnapshot.capturedAt)),
  );
}

// A poller isn't guaranteed to write every channel of one sync in a single
// transaction, so neither "rows sharing one exact capturedAt" nor "the
// latest row per channel, independent of the others" is safe: the former
// can lose channels to per-row autocommit timestamps, the latter can mix a
// channel that stopped reporting with a newer sync of the others (each row
// individually respects `traffic_breakdown_pct_range`, but nothing
// constrains the *set* to sum to ~100%). Splitting the difference: find each
// slug's own most recent capturedAt, then take every row within a short
// tolerance of it — wide enough to absorb multiple autocommit inserts from
// one sync run, narrow enough that a genuinely new sync hours later isn't
// merged in. Unbounded (no fixed history window) for the same reason as
// fetchLatestMetricSnapshots: a channel split shouldn't silently drop out of
// the rollup once it ages past a fixed window.
const BREAKDOWN_BATCH_TOLERANCE_MS = 5 * 60 * 1000;

export async function fetchLatestTrafficBreakdowns(
  db: DrizzleDb,
  slugs: string[],
): Promise<TrafficBreakdownRow[]> {
  return forSlugs(slugs, async () => {
    const latestCapturedAtBySlug = await db
      .select({
        slug: trafficBreakdown.slug,
        capturedAt: max(trafficBreakdown.capturedAt),
      })
      .from(trafficBreakdown)
      .where(inArray(trafficBreakdown.slug, slugs))
      .groupBy(trafficBreakdown.slug);

    const batchConditions = latestCapturedAtBySlug.flatMap((row) => {
      if (!row.capturedAt) {
        return [];
      }
      const batchStart = new Date(
        row.capturedAt.getTime() - BREAKDOWN_BATCH_TOLERANCE_MS,
      );
      return [
        and(
          eq(trafficBreakdown.slug, row.slug),
          gte(trafficBreakdown.capturedAt, batchStart),
        ),
      ];
    });

    if (!batchConditions.length) {
      return [];
    }

    return db
      .select()
      .from(trafficBreakdown)
      .where(or(...batchConditions));
  });
}

export function fetchSyndicationPosts(
  db: DrizzleDb,
  slug: string,
): Promise<SyndicationPostRow[]> {
  return db
    .select()
    .from(syndicationPost)
    .where(eq(syndicationPost.slug, slug))
    .orderBy(desc(syndicationPost.syncedAt), asc(syndicationPost.platform));
}

export function fetchSyncStatuses(
  db: DrizzleDb,
  slugs: string[],
): Promise<SyncStatusRow[]> {
  return forSlugs(slugs, () =>
    db.select().from(syncStatus).where(inArray(syncStatus.slug, slugs)),
  );
}

export function fetchIntegrationConfigs(
  db: DrizzleDb,
  slugs: string[],
): Promise<IntegrationConfigRow[]> {
  return forSlugs(slugs, () =>
    db
      .select()
      .from(integrationConfig)
      .where(inArray(integrationConfig.slug, slugs)),
  );
}
