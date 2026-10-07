import { inArray, sql } from "drizzle-orm";
import { metricSnapshot, trafficBreakdown } from "../db/schema";
import {
  BREAKDOWN_BATCH_TOLERANCE_MS,
  SERIES_WINDOW_DAYS,
} from "../utils/dashboardQueries";
import type { DrizzleDb } from "../utils/dashboardQueries";

// Must stay comfortably above SERIES_WINDOW_DAYS so the sparkline window
// never reads into pruned history.
export const SNAPSHOT_RETENTION_DAYS = SERIES_WINDOW_DAYS + 30;

// Caps rows deleted per table per run. The sync route runs every 15 minutes
// under a short serverless time limit, so a large backlog drains over
// several runs instead of one long DELETE.
export const PRUNE_BATCH_LIMIT = 1_000;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PruneSummary {
  metricSnapshotDeleted: number;
  trafficBreakdownDeleted: number;
}

export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(
    now.getTime() - SNAPSHOT_RETENTION_DAYS * MILLISECONDS_PER_DAY,
  );
}

// The current-value tiles read the latest row per (slug, vendor, metric,
// period) with no time bound, so a row is only prunable when a newer row
// exists for the same key. A vendor that stopped syncing keeps its last value.
async function pruneMetricSnapshots(
  db: DrizzleDb,
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(metricSnapshot)
    .where(
      inArray(
        metricSnapshot.id,
        sql`(
          select old_row.id from metric_snapshot old_row
          where old_row.captured_at < ${cutoff.toISOString()}::timestamptz
            and exists (
              select 1 from metric_snapshot newer_row
              where newer_row.slug = old_row.slug
                and newer_row.vendor = old_row.vendor
                and newer_row.metric = old_row.metric
                and newer_row.period = old_row.period
                and newer_row.captured_at > old_row.captured_at
            )
          order by old_row.captured_at asc
          limit ${PRUNE_BATCH_LIMIT}
        )`,
      ),
    )
    .returning({ id: metricSnapshot.id });
  return deleted.length;
}

// fetchLatestTrafficBreakdown returns every row within
// BREAKDOWN_BATCH_TOLERANCE_MS of a slug's newest capture, so only rows
// strictly older than that batch are prunable.
async function pruneTrafficBreakdowns(
  db: DrizzleDb,
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(trafficBreakdown)
    .where(
      inArray(
        trafficBreakdown.id,
        sql`(
          select old_row.id from traffic_breakdown old_row
          where old_row.captured_at < ${cutoff.toISOString()}::timestamptz
            and exists (
              select 1 from traffic_breakdown newer_row
              where newer_row.slug = old_row.slug
                and newer_row.captured_at
                  > old_row.captured_at + ${BREAKDOWN_BATCH_TOLERANCE_MS}::double precision * interval '1 millisecond'
            )
          order by old_row.captured_at asc
          limit ${PRUNE_BATCH_LIMIT}
        )`,
      ),
    )
    .returning({ id: trafficBreakdown.id });
  return deleted.length;
}

function valuesOrThrowFailures(
  results: PromiseSettledResult<number>[],
): number[] {
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length === 1) {
    throw failures[0]!.reason;
  }
  if (failures.length > 1) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "snapshot retention prune failed for multiple tables",
    );
  }
  return results.map(
    (result) => (result as PromiseFulfilledResult<number>).value,
  );
}

// Runs both prunes even if one rejects, so a lock timeout on one table never
// starves the other; failures are rethrown afterwards for reporting.
export async function pruneOldSnapshots(
  db: DrizzleDb,
  now: Date = new Date(),
): Promise<PruneSummary> {
  const cutoff = retentionCutoff(now);
  const [metricSnapshotDeleted, trafficBreakdownDeleted] =
    valuesOrThrowFailures(
      await Promise.allSettled([
        pruneMetricSnapshots(db, cutoff),
        pruneTrafficBreakdowns(db, cutoff),
      ]),
    );
  return {
    metricSnapshotDeleted: metricSnapshotDeleted!,
    trafficBreakdownDeleted: trafficBreakdownDeleted!,
  };
}
