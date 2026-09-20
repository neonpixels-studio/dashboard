// Thin, isolated data-access layer for the read-side dashboard endpoints.
// Every function takes `db` as its first argument (never calls `useDb()`
// itself) so handlers stay wired to the real Neon connection while tests
// exercise these against a fake `db` — same pattern as
// server/db/seed.ts:seedIntegrationConfig. All shaping/aggregation logic
// lives in dashboardShaping.ts, which operates on plain row arrays and needs
// no `db` fake at all.
import { and, asc, eq, gte, inArray } from "drizzle-orm";
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

// Bounds the metric_snapshot / traffic_breakdown history fetch: wide enough
// to always contain the latest row per (slug, metric) even if a poller
// misses a run, without pulling unbounded history as rows accumulate. One
// fetch backs both the "current value" tiles and the sparkline series.
const HISTORY_WINDOW_DAYS = 60;

function historyWindowStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - HISTORY_WINDOW_DAYS);
  return start;
}

export async function fetchMetricSnapshots(
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
        gte(metricSnapshot.capturedAt, historyWindowStart()),
      ),
    )
    .orderBy(asc(metricSnapshot.capturedAt));
}

export async function fetchTrafficBreakdowns(
  db: DrizzleDb,
  slugs: string[],
): Promise<TrafficBreakdownRow[]> {
  if (!slugs.length) {
    return [];
  }
  return db
    .select()
    .from(trafficBreakdown)
    .where(
      and(
        inArray(trafficBreakdown.slug, slugs),
        gte(trafficBreakdown.capturedAt, historyWindowStart()),
      ),
    )
    .orderBy(asc(trafficBreakdown.capturedAt));
}

export async function fetchSyndicationPosts(
  db: DrizzleDb,
  slug: string,
): Promise<SyndicationPostRow[]> {
  return db
    .select()
    .from(syndicationPost)
    .where(eq(syndicationPost.slug, slug));
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
