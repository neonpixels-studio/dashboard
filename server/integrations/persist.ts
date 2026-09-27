// DB-touching half of the sync orchestrator, isolated from the pure
// orchestration loop in orchestrator.ts — the loop takes these as injected
// functions, so it never imports this module (or drizzle) directly, and
// this module never needs a fake provider or a fake clock to be exercised.
import { and, eq, getTableColumns, isNull, lte, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  integrationConfig,
  metricSnapshot,
  syncStatus,
  syndicationPost,
  trafficBreakdown,
} from "../db/schema";
import type { DrizzleDb } from "../utils/dashboardQueries";
import type { SyncStatusWrite } from "./orchestrator";
import type { IntegrationConfigRow, ProviderResult } from "./types";

// Stamps the orchestrator's own slug onto every row a provider returned
// (see types.ts's *Input types, which omit `slug` for exactly this reason).
// Shared by all three arrays below rather than repeating the same `.map`
// three times for the same concern.
function withSlug<Row>(rows: Row[], slug: string): (Row & { slug: string })[] {
  return rows.map((row) => ({ ...row, slug }));
}

// A single INSERT ... VALUES whose rows share a conflict target makes
// Postgres raise "ON CONFLICT DO UPDATE command cannot affect row a second
// time", failing the whole batched sync — this collapses those before they
// reach the DB, last row per key wins. `keyOf` is JSON.stringify'd (not
// joined with a separator) so a free-text column value can't collapse two
// distinct rows into the same key.
function warnOnDuplicateConflictKey(
  rowsByConflictKey: Map<string, unknown>,
  conflictKey: string,
): void {
  if (!rowsByConflictKey.has(conflictKey)) {
    return;
  }
  console.warn(
    "Dropping duplicate row sharing an upsert conflict key; keeping the last one seen.",
    { conflictKey },
  );
}

function dedupeByConflictKey<Row>(
  rows: Row[],
  keyOf: (row: Row) => unknown[],
): Row[] {
  const rowsByConflictKey = new Map<string, Row>();
  for (const row of rows) {
    const conflictKey = JSON.stringify(keyOf(row));
    warnOnDuplicateConflictKey(rowsByConflictKey, conflictKey);
    rowsByConflictKey.set(conflictKey, row);
  }
  return [...rowsByConflictKey.values()];
}

// Ordered oldest-synced-first (a row with no sync_status row at all — never
// synced — sorts before every row that has one), rather than left in
// whatever order Postgres happens to return. server/integrations/
// orchestrator.ts's runSync can cut a run short under its own time budget,
// leaving a tail of enabled rows unattempted; without this ordering, an
// unordered/heap-order result set would leave the *same* tail behind every
// time the budget is hit, rather than rotating which rows lose out. The
// join is at most one sync_status row per (slug, vendor) — enforced by
// sync_status_slug_vendor_idx in schema.ts — so it can't fan this query out
// to duplicate integration_config rows.
//
// integration_config.vendor is the integration_vendor Postgres enum, while
// sync_status.vendor is plain text (schema.ts: sync_status also tracks
// vendors with no integration_config row at all, e.g. GitHub issue counts —
// see that table's own comment — so it can't use the enum type). Postgres
// has no implicit enum<->text cast for a column-to-column comparison, so the
// enum side is cast explicitly here or this join fails outright at query
// time (`operator does not exist: text = integration_vendor`) — every
// /api/sync invocation, not just the ordering feature.
export function listEnabledIntegrationConfigs(
  db: DrizzleDb,
): Promise<IntegrationConfigRow[]> {
  return db
    .select(getTableColumns(integrationConfig))
    .from(integrationConfig)
    .leftJoin(
      syncStatus,
      and(
        eq(syncStatus.slug, integrationConfig.slug),
        eq(syncStatus.vendor, sql`${integrationConfig.vendor}::text`),
      ),
    )
    .where(eq(integrationConfig.enabled, true))
    .orderBy(
      sql`${syncStatus.lastRunAt} asc nulls first, ${integrationConfig.id} asc`,
    );
}

// Every row a provider's fetch() returned, stamped with the slug the
// orchestrator already knows (see types.ts's *Input types), written as one
// batched request. server/db/index.ts's neon-http driver has no interactive
// db.transaction() ("No transactions support in neon-http driver" — see
// node_modules/drizzle-orm/neon-http/session.js), so db.batch() is the
// closest available atomicity: Neon runs the whole array as one HTTP-level
// transaction, so a failure partway through (e.g. the syndication_post
// upsert) rolls back the metric_snapshot/traffic_breakdown rows from the
// same call too, instead of leaving half a sync's data behind.
export function persistProviderResult(
  db: DrizzleDb,
  row: IntegrationConfigRow,
  result: ProviderResult,
): Promise<unknown> {
  const metricRows = dedupeByConflictKey(
    withSlug(result.metrics, row.slug),
    (metricRow) => [
      metricRow.slug,
      metricRow.vendor,
      metricRow.metric,
      metricRow.period,
      metricRow.capturedAt.toISOString(),
    ],
  );
  const trafficRows = withSlug(result.trafficBreakdown, row.slug);
  const syndicationRows = dedupeByConflictKey(
    withSlug(result.syndicationPosts, row.slug),
    (syndicationRow) => [
      syndicationRow.slug,
      syndicationRow.platform,
      syndicationRow.postRef,
    ],
  );

  // Left untyped (rather than `: BatchItem<"pg">[]`) so each element keeps
  // its concrete insert-builder type, which — unlike the wider
  // RunnableQuery/BatchItem interface — actually implements Promise. That's
  // what lets the writes.length === 1 branch below return an element
  // directly as a Promise<unknown>; only the multi-write db.batch() call
  // needs the BatchItem<"pg"> shape, so it casts there instead.
  const writes = [
    ...(metricRows.length
      ? [
          db
            .insert(metricSnapshot)
            .values(metricRows)
            // GA4's PERIOD_DAILY backfill (server/integrations/ga4/provider.ts)
            // re-reports up to 30 prior days every sync, each keyed by its own
            // calendar day — a re-sync must update that day's value in place
            // rather than duplicate-inserting it. Same excluded-row pattern as
            // the syndication_post upsert below.
            .onConflictDoUpdate({
              target: [
                metricSnapshot.slug,
                metricSnapshot.vendor,
                metricSnapshot.metric,
                metricSnapshot.period,
                metricSnapshot.capturedAt,
              ],
              set: { value: sql`excluded.value` },
            }),
        ]
      : []),
    ...(trafficRows.length
      ? [db.insert(trafficBreakdown).values(trafficRows)]
      : []),
    ...(syndicationRows.length
      ? [
          db
            .insert(syndicationPost)
            .values(syndicationRows)
            // Re-syncing the same (slug, platform, post_ref) updates the row
            // in place rather than duplicating it — see the unique index in
            // schema.ts. `excluded` is the just-proposed row from VALUES;
            // referencing it per-column (not a JS value) is required here
            // since this is a bulk upsert of however many posts a provider
            // returned in one call.
            .onConflictDoUpdate({
              target: [
                syndicationPost.slug,
                syndicationPost.platform,
                syndicationPost.postRef,
              ],
              set: {
                status: sql`excluded.status`,
                syncedAt: sql`excluded.synced_at`,
              },
            }),
        ]
      : []),
  ];

  if (!writes.length) {
    return Promise.resolve(undefined);
  }
  if (writes.length === 1) {
    // Guarded by the length check above, so this index is always present.
    return writes[0]!;
  }
  return db.batch(writes as unknown as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

// One row per (slug, vendor), overwritten every run (see schema.ts). On
// failure, `lastSuccessAt` is left untouched by referencing the table's own
// current value in the UPDATE — so the health chips can still show "last
// succeeded 3 days ago" instead of losing that fact the moment a vendor
// starts failing.
export function recordSyncStatus(
  db: DrizzleDb,
  status: SyncStatusWrite,
): Promise<unknown> {
  return db
    .insert(syncStatus)
    .values({
      slug: status.slug,
      vendor: status.vendor,
      lastRunAt: status.runAt,
      lastSuccessAt: status.ok ? status.runAt : null,
      ok: status.ok,
      error: status.error,
    })
    .onConflictDoUpdate({
      target: [syncStatus.slug, syncStatus.vendor],
      set: {
        lastRunAt: status.runAt,
        ok: status.ok,
        error: status.error,
        lastSuccessAt: status.ok
          ? status.runAt
          : sql`${syncStatus.lastSuccessAt}`,
      },
    });
}

// Attempt-independent watermark, deliberately separate from recordSyncStatus
// above: that function is only ever called by the orchestrator, once per row
// per tick, AFTER a provider's fetch() has already returned or thrown — and
// it runs on every tick, including one where a provider's own guard decided
// to skip and never made a real network call at all (see
// server/utils/dashboardQueries.ts's fetchLastAttemptedSyncAt comment). This
// one is called directly by a provider itself (currently only Medium's, see
// server/integrations/syndication/medium/provider.ts), right before it makes
// a real, rate-limited network call, so `last_attempted_at` only ever
// advances on a genuine attempt — success or failure alike.
//
// Atomic claim, not a plain upsert: the caller's own pre-check (e.g. Medium's
// isMediumSyncDue) reads the watermark and decides "due" in one step, then
// would write it in a separate step — two overlapping calls (a slow tick
// still running when the next one fires, or a scheduled tick racing a manual
// POST /api/sync) can both read "due" before either writes, and both go on to
// call the real, rate-limited API. `setWhere` folds the same staleness check
// into the UPDATE itself, so only the call that actually lands within
// Postgres's row-level lock ever gets a row back from `.returning()` — the
// other sees zero rows and knows it lost the race. `minIntervalMs` is passed
// in (rather than hardcoded here) so this stays a generic sync_status
// primitive with no Medium-specific policy baked in; Medium passes
// mediumSyncGuard.ts's MEDIUM_MIN_SYNC_INTERVAL_MS.
//
// Only ever sets last_attempted_at; every other sync_status column
// (last_run_at, ok, error, last_success_at) is left exactly as
// recordSyncStatus already manages it, including on first insert (their
// schema.ts defaults/nullability apply) — this call has no opinion on
// run/outcome bookkeeping, only on when a real attempt started.
export async function recordSyncAttempt(
  db: DrizzleDb,
  slug: string,
  vendor: string,
  attemptedAt: Date,
  minIntervalMs: number,
): Promise<boolean> {
  const staleBefore = new Date(attemptedAt.getTime() - minIntervalMs);
  const claimedRows = await db
    .insert(syncStatus)
    .values({ slug, vendor, lastAttemptedAt: attemptedAt })
    .onConflictDoUpdate({
      target: [syncStatus.slug, syncStatus.vendor],
      set: { lastAttemptedAt: attemptedAt },
      setWhere: or(
        isNull(syncStatus.lastAttemptedAt),
        lte(syncStatus.lastAttemptedAt, staleBefore),
      ),
    })
    .returning({ slug: syncStatus.slug });
  return claimedRows.length > 0;
}
