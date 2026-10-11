// Thin, isolated data-access layer for the read-side dashboard endpoints.
// Every function takes `db` as its first argument (never calls `useDb()`
// itself) so handlers stay wired to the real Neon connection while tests
// exercise these against a fake `db` — same pattern as
// server/db/seed.ts:seedIntegrationConfig. All shaping/aggregation logic
// lives in dashboardShaping.ts, which operates on plain row arrays and needs
// no `db` fake at all.
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  max,
  or,
} from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/neon-http";
import type * as schema from "../db/schema";
import {
  deployStatus,
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
export type DeployStatusRow = InferSelectModel<typeof deployStatus>;

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
// (slug, vendor, metric, period) — unbounded, so a vendor that's been broken
// (or simply unpolled) for longer than any fixed window doesn't silently
// vanish from a sum with no null and no indication anything was excluded.
// Postgres `DISTINCT ON` is exactly this query, and the ORDER BY below
// matches the DISTINCT ON columns (required) before breaking ties on the
// newest capture. `vendor` is part of the DISTINCT ON key (not just
// slug/metric/period): the schema lets more than one vendor report the same
// (slug, metric, period) — e.g. every syndication provider writes its own
// `posts`/`current` row for the same content slug — and collapsing on
// slug/metric/period alone would keep only whichever vendor happened to
// poll most recently, silently discarding every other vendor's row before
// dashboardShaping.ts's per-vendor summation ever sees it.
export function fetchLatestMetricSnapshots(
  db: DrizzleDb,
  slugs: string[],
): Promise<MetricSnapshotRow[]> {
  return forSlugs(slugs, () =>
    db
      .selectDistinctOn([
        metricSnapshot.slug,
        metricSnapshot.vendor,
        metricSnapshot.metric,
        metricSnapshot.period,
      ])
      .from(metricSnapshot)
      .where(inArray(metricSnapshot.slug, slugs))
      .orderBy(
        metricSnapshot.slug,
        metricSnapshot.vendor,
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
export const BREAKDOWN_BATCH_TOLERANCE_MS = 5 * 60 * 1000;

export function breakdownBatchStart(capturedAt: Date): Date {
  return new Date(capturedAt.getTime() - BREAKDOWN_BATCH_TOLERANCE_MS);
}

// The tolerance window can legitimately return more than one row for the
// same (slug, channel) — e.g. a retried or overlapping poll run landing
// within the same window as the original. There's no unique index on
// (slug, channel) to rule that out at the schema level, and the shaping
// layer (trafficChannelSplitForApp/trafficChannelSplitAcrossApps) assumes
// exactly one row per channel, so this keeps only the newest per channel
// before returning.
function dedupeByChannel(rows: TrafficBreakdownRow[]): TrafficBreakdownRow[] {
  const newestByChannel = new Map<string, TrafficBreakdownRow>();
  rows.forEach((row) => {
    const key = `${row.slug}::${row.channel}`;
    const existing = newestByChannel.get(key);
    if (!existing || row.capturedAt > existing.capturedAt) {
      newestByChannel.set(key, row);
    }
  });
  return [...newestByChannel.values()];
}

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
      return [
        and(
          eq(trafficBreakdown.slug, row.slug),
          gte(trafficBreakdown.capturedAt, breakdownBatchStart(row.capturedAt)),
        ),
      ];
    });

    if (!batchConditions.length) {
      return [];
    }

    const rows = await db
      .select()
      .from(trafficBreakdown)
      .where(or(...batchConditions));
    return dedupeByChannel(rows);
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

// Every stored external id (Medium's article id) for one (slug, platform),
// mapped to when its row was last fetched, so the Medium provider can spend
// its capped detail requests on articles with no row yet, then on the
// stalest ones. Rows without an external id (every non-Medium platform) are
// skipped.
export async function fetchSyndicationFetchedAtByExternalId(
  db: DrizzleDb,
  slug: string,
  platform: string,
): Promise<Map<string, Date | null>> {
  const rows = await db
    .select({
      externalId: syndicationPost.externalId,
      fetchedAt: syndicationPost.fetchedAt,
    })
    .from(syndicationPost)
    .where(
      and(
        eq(syndicationPost.slug, slug),
        eq(syndicationPost.platform, platform),
        isNotNull(syndicationPost.externalId),
      ),
    );
  const fetchedAtByExternalId = new Map<string, Date | null>();
  for (const row of rows) {
    if (row.externalId === null) {
      continue;
    }
    fetchedAtByExternalId.set(row.externalId, row.fetchedAt);
  }
  return fetchedAtByExternalId;
}

// Powers server/integrations/syndication/medium's rate-limit guard: the
// most recent capturedAt a given (slug, vendor, metric) metric_snapshot row
// was actually written with.
//
// Deliberately metric_snapshot (written ONLY when buildSyndicationResult
// runs, i.e. after Medium's real network calls already succeeded), not
// sync_status.last_run_at/last_success_at. sync_status is written by the
// orchestrator on EVERY tick regardless of what a provider's fetch()
// actually did internally — including a tick where the guard itself decided
// to skip and returned empty data with no exception. Gating on sync_status
// would make the row's own timestamp advance every hour forever
// (each skip re-stamps "last run" to "just now", which the very next tick
// then reads back as "attempted an hour ago" — permanently not due,
// after the very first sync ever succeeds). metric_snapshot has no such
// self-feedback loop: a skip returns zero metric rows, so persist.ts writes
// nothing and this clock only moves on a real, fully-succeeded attempt.
//
// A PERSISTENTLY FAILING Medium sync (bad/revoked key, a mapping bug) never
// reaches buildSyndicationResult, so this clock alone would never advance and
// the guard would stay "due" every orchestrator tick until it's fixed —
// unlike Stripe/GA4 (no guard, so no retry-storm exposure to begin with),
// this provider's requests are capped at 150/month, so that would burn the
// monthly budget within hours. See fetchLastAttemptedSyncAt below and
// mediumSyncGuard.ts's isMediumSyncDue, which combines both watermarks.
export async function fetchLatestMetricCapturedAt(
  db: DrizzleDb,
  slug: string,
  vendor: string,
  metric: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ capturedAt: metricSnapshot.capturedAt })
    .from(metricSnapshot)
    .where(
      and(
        eq(metricSnapshot.slug, slug),
        eq(metricSnapshot.vendor, vendor),
        eq(metricSnapshot.metric, metric),
      ),
    )
    .orderBy(desc(metricSnapshot.capturedAt))
    .limit(1);
  return row?.capturedAt ?? null;
}

// The attempt-independent counterpart to fetchLatestMetricCapturedAt above:
// reads sync_status.last_attempted_at for a (slug, vendor), which
// server/integrations/persist.ts's recordSyncAttempt stamps right before a
// provider's guard lets a real network call through — regardless of whether
// that call goes on to succeed or fail. Only Medium's guard reads this today
// (mediumSyncGuard.ts's isMediumSyncDue), but it lives here, not inlined in
// that provider, for the same reason fetchLatestMetricCapturedAt does: a
// thin, injectable, DB-touching read the provider's factory can override in
// tests.
export async function fetchLastAttemptedSyncAt(
  db: DrizzleDb,
  slug: string,
  vendor: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ lastAttemptedAt: syncStatus.lastAttemptedAt })
    .from(syncStatus)
    .where(and(eq(syncStatus.slug, slug), eq(syncStatus.vendor, vendor)))
    .limit(1);
  return row?.lastAttemptedAt ?? null;
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

// Latest production deploy per slug (one row each, see schema.ts's
// deployStatus). Omit `slugs` for every property, as the overview Alerts
// panel needs.
export function fetchDeployStatuses(
  db: DrizzleDb,
  slugs?: string[],
): Promise<DeployStatusRow[]> {
  if (!slugs) {
    return db.select().from(deployStatus);
  }
  return forSlugs(slugs, () =>
    db.select().from(deployStatus).where(inArray(deployStatus.slug, slugs)),
  );
}
