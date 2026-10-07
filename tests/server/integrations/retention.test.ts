import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { metricSnapshot, trafficBreakdown } from "../../../server/db/schema";
import {
  PRUNE_BATCH_LIMIT,
  SNAPSHOT_RETENTION_DAYS,
  pruneOldSnapshots,
  retentionCutoff,
} from "../../../server/integrations/retention";
import {
  BREAKDOWN_BATCH_TOLERANCE_MS,
  SERIES_WINDOW_DAYS,
} from "../../../server/utils/dashboardQueries";

type FakeDb = Parameters<typeof pruneOldSnapshots>[0];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-07T12:00:00.000Z");
const dialect = new PgDialect();

function createFakeDb(deletedRowsPerCall: unknown[][] = [[], []]) {
  const returning = vi.fn();
  deletedRowsPerCall.forEach((rows) => returning.mockResolvedValueOnce(rows));
  const where = vi.fn().mockReturnValue({ returning });
  const deleteFrom = vi.fn().mockReturnValue({ where });
  return {
    db: { delete: deleteFrom } as unknown as FakeDb,
    where,
    deleteFrom,
    returning,
  };
}

function compiledWhere(where: ReturnType<typeof vi.fn>, callIndex: number) {
  const query = dialect.sqlToQuery(where.mock.calls[callIndex]![0] as SQL);
  return { ...query, sql: query.sql.replace(/\s+/g, " ") };
}

describe("retentionCutoff", () => {
  it("keeps the retention window strictly wider than the sparkline window", () => {
    expect(SNAPSHOT_RETENTION_DAYS).toBeGreaterThan(SERIES_WINDOW_DAYS);
  });

  it("subtracts the retention window from now", () => {
    expect(NOW.getTime() - retentionCutoff(NOW).getTime()).toBe(
      SNAPSHOT_RETENTION_DAYS * MILLISECONDS_PER_DAY,
    );
  });
});

describe("pruneOldSnapshots", () => {
  it("deletes from metric_snapshot then traffic_breakdown and reports counts", async () => {
    const { db, deleteFrom } = createFakeDb([
      [{ id: 1 }, { id: 2 }],
      [{ id: 9 }],
    ]);

    const summary = await pruneOldSnapshots(db, NOW);

    expect(deleteFrom).toHaveBeenNthCalledWith(1, metricSnapshot);
    expect(deleteFrom).toHaveBeenNthCalledWith(2, trafficBreakdown);
    expect(summary).toEqual({
      metricSnapshotDeleted: 2,
      trafficBreakdownDeleted: 1,
    });
  });

  it("returns zero counts when nothing is old enough", async () => {
    const { db } = createFakeDb();

    await expect(pruneOldSnapshots(db, NOW)).resolves.toEqual({
      metricSnapshotDeleted: 0,
      trafficBreakdownDeleted: 0,
    });
  });

  it("bounds each delete by the cutoff and the batch limit", async () => {
    const { db, where } = createFakeDb();

    await pruneOldSnapshots(db, NOW);

    for (const callIndex of [0, 1]) {
      const { sql: statement, params } = compiledWhere(where, callIndex);
      expect(statement).toContain("old_row.captured_at <");
      expect(statement).toContain("limit");
      expect(params).toContain(PRUNE_BATCH_LIMIT);
      expect(params).toContain(retentionCutoff(NOW).toISOString());
    }
  });

  it("only deletes metric rows that have a newer row for the same key", async () => {
    const { db, where } = createFakeDb();

    await pruneOldSnapshots(db, NOW);

    const { sql: statement } = compiledWhere(where, 0);
    for (const keyColumn of ["slug", "vendor", "metric", "period"]) {
      expect(statement).toContain(
        `newer_row.${keyColumn} = old_row.${keyColumn}`,
      );
    }
    expect(statement).toContain(
      "and newer_row.captured_at > old_row.captured_at )",
    );
  });

  it("never deletes the latest traffic batch of a slug", async () => {
    const { db, where } = createFakeDb();

    await pruneOldSnapshots(db, NOW);

    const { sql: statement, params } = compiledWhere(where, 1);
    expect(statement).toContain("newer_row.slug = old_row.slug");
    expect(statement).toContain(
      "and newer_row.captured_at > old_row.captured_at + $2::double precision * interval '1 millisecond'",
    );
    expect(params).toContain(BREAKDOWN_BATCH_TOLERANCE_MS);
  });

  it("still attempts the traffic prune when the metric prune rejects", async () => {
    const failure = new Error("lock timeout");
    const { db, returning } = createFakeDb([]);
    returning.mockRejectedValueOnce(failure).mockResolvedValueOnce([]);

    await expect(pruneOldSnapshots(db, NOW)).rejects.toBe(failure);
    expect(returning).toHaveBeenCalledTimes(2);
  });

  it("reports both failures when both prunes reject", async () => {
    const metricFailure = new Error("metric lock timeout");
    const trafficFailure = new Error("traffic lock timeout");
    const { db, returning } = createFakeDb([]);
    returning
      .mockRejectedValueOnce(metricFailure)
      .mockRejectedValueOnce(trafficFailure);

    await expect(pruneOldSnapshots(db, NOW)).rejects.toMatchObject({
      errors: [metricFailure, trafficFailure],
    });
  });
});
