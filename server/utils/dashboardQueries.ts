// Thin, isolated data-access layer for the read-side dashboard endpoints.
// Every function takes `db` as its first argument (never calls `useDb()`
// itself) so handlers stay wired to the real Neon connection while tests
// exercise these against a fake `db` — same pattern as
// server/db/seed.ts:seedIntegrationConfig. All shaping/aggregation logic
// lives in dashboardShaping.ts, which operates on plain row arrays and needs
// no `db` fake at all.
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
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

// The current-value tiles and rollups need the single latest row per
// (slug, metric, period) — unbounded, so a vendor that's been broken (or
// simply unpolled) for longer than any fixed window doesn't silently vanish
// from a sum with no null and no indication anything was excluded. Postgres
// `DISTINCT ON` is exactly this query, and the ORDER BY below matches the
// DISTINCT ON columns (required) before breaking ties on the newest capture.
export async function fetchLatestMetricSnapshots(
  db: DrizzleDb,
  slugs: string[],
): Promise<MetricSnapshotRow[]> {
  if (!slugs.length) {
    return [];
  }
  return db
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
    );
}

// Sparklines draw from a bounded history instead: wide enough to always
// contain several points per (slug, metric, period) even if a poller misses
// a run, without pulling unbounded history as rows accumulate. This is only
// for the chart series — current-value tiles/rollups use
// fetchLatestMetricSnapshots (unbounded) so they never drop stale-but-real
// data.
const SERIES_WINDOW_DAYS = 60;

function seriesWindowStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - SERIES_WINDOW_DAYS);
  return start;
}

export async function fetchMetricSnapshotSeries(
  db: DrizzleDb,
  slugs: string[],
): Promise<MetricSnapshotRow[]> {
  if (!slugs.length) {
    return [];
  }
  return db
    .select()
    .from(metricSnapshot)
    .where(
      and(
        inArray(metricSnapshot.slug, slugs),
        gte(metricSnapshot.capturedAt, seriesWindowStart()),
      ),
    )
    .orderBy(asc(metricSnapshot.capturedAt));
}

// The latest row per (slug, channel), independent of the other channels —
// deliberately not "the latest batch of rows sharing one capturedAt", since
// nothing enforces the poller writing every channel in a single transaction.
// Unbounded for the same reason as fetchLatestMetricSnapshots: a channel
// split shouldn't silently drop out of the rollup once it ages past a fixed
// window.
export async function fetchLatestTrafficBreakdowns(
  db: DrizzleDb,
  slugs: string[],
): Promise<TrafficBreakdownRow[]> {
  if (!slugs.length) {
    return [];
  }
  return db
    .selectDistinctOn([trafficBreakdown.slug, trafficBreakdown.channel])
    .from(trafficBreakdown)
    .where(inArray(trafficBreakdown.slug, slugs))
    .orderBy(
      trafficBreakdown.slug,
      trafficBreakdown.channel,
      desc(trafficBreakdown.capturedAt),
    );
}

export async function fetchSyndicationPosts(
  db: DrizzleDb,
  slug: string,
): Promise<SyndicationPostRow[]> {
  return db
    .select()
    .from(syndicationPost)
    .where(eq(syndicationPost.slug, slug))
    .orderBy(desc(syndicationPost.syncedAt), asc(syndicationPost.platform));
}

export async function fetchSyncStatuses(
  db: DrizzleDb,
  slugs: string[],
): Promise<SyncStatusRow[]> {
  if (!slugs.length) {
    return [];
  }
  return db.select().from(syncStatus).where(inArray(syncStatus.slug, slugs));
}

export async function fetchIntegrationConfigs(
  db: DrizzleDb,
  slugs: string[],
): Promise<IntegrationConfigRow[]> {
  if (!slugs.length) {
    return [];
  }
  return db
    .select()
    .from(integrationConfig)
    .where(inArray(integrationConfig.slug, slugs));
}
