import { describe, expect, it, vi } from "vitest";
import {
  breakdownBatchStart,
  fetchIntegrationConfigs,
  fetchLatestMetricCapturedAt,
  fetchLatestMetricSnapshots,
  fetchLatestTrafficBreakdowns,
  fetchMetricSnapshotSeries,
  fetchSyncStatuses,
  fetchSyndicationPosts,
  seriesWindowStart,
  SERIES_WINDOW_DAYS,
} from "../../../server/utils/dashboardQueries";

type FakeDb = Parameters<typeof fetchMetricSnapshotSeries>[0];

// Stubs `select().from().where().orderBy()` — the chain used by the bounded
// series fetch (metric_snapshot).
function createOrderedFakeDb(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } as unknown as FakeDb, select, from, where, orderBy };
}

// Stubs `select().from().where()` — the chain used by the "current only, no
// history" fetches (sync_status, integration_config).
function createUnorderedFakeDb(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } as unknown as FakeDb, select, from, where };
}

// Stubs `selectDistinctOn().from().where().orderBy()` — the chain used by
// the unbounded "latest per group" metric_snapshot fetch.
function createDistinctFakeDb(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const selectDistinctOn = vi.fn().mockReturnValue({ from });
  return {
    db: { selectDistinctOn } as unknown as FakeDb,
    selectDistinctOn,
    from,
    where,
    orderBy,
  };
}

// fetchLatestTrafficBreakdowns is two queries: first the max capturedAt per
// slug (`select().from().where().groupBy()`), then the batch of rows near
// each slug's max (`select().from().where()`). Stubs `db.select` to return
// a different chain on each of its two calls.
function createTrafficBreakdownFakeDb(
  maxRows: { slug: string; capturedAt: Date | null }[],
  detailRows: unknown[],
) {
  const groupBy = vi.fn().mockResolvedValue(maxRows);
  const whereForMax = vi.fn().mockReturnValue({ groupBy });
  const fromForMax = vi.fn().mockReturnValue({ where: whereForMax });

  const whereForDetail = vi.fn().mockResolvedValue(detailRows);
  const fromForDetail = vi.fn().mockReturnValue({ where: whereForDetail });

  const select = vi
    .fn()
    .mockReturnValueOnce({ from: fromForMax })
    .mockReturnValueOnce({ from: fromForDetail });

  return {
    db: { select } as unknown as FakeDb,
    select,
    groupBy,
    whereForMax,
    whereForDetail,
  };
}

describe("seriesWindowStart", () => {
  it(`returns exactly ${SERIES_WINDOW_DAYS} days before the given moment`, () => {
    const now = new Date("2026-09-20T12:00:00Z");
    const start = seriesWindowStart(now);
    const daysBack = (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysBack).toBe(SERIES_WINDOW_DAYS);
  });

  it("holds across a month boundary", () => {
    const start = seriesWindowStart(new Date("2026-01-15T00:00:00Z"));
    expect(start.toISOString()).toBe(
      new Date("2025-11-16T00:00:00Z").toISOString(),
    );
  });
});

describe("fetchLatestMetricSnapshots", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, selectDistinctOn } = createDistinctFakeDb([]);
    expect(await fetchLatestMetricSnapshots(db, [])).toEqual([]);
    expect(selectDistinctOn).not.toHaveBeenCalled();
  });

  it("returns whatever rows the query resolves", async () => {
    const rows = [{ id: 1 }];
    const { db, orderBy } = createDistinctFakeDb(rows);
    await expect(fetchLatestMetricSnapshots(db, ["basin"])).resolves.toEqual(
      rows,
    );
    expect(orderBy).toHaveBeenCalled();
  });
});

describe("fetchMetricSnapshotSeries", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, select } = createOrderedFakeDb([]);
    expect(await fetchMetricSnapshotSeries(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns whatever rows the query resolves, ordered ascending", async () => {
    const rows = [{ id: 1 }];
    const { db, orderBy } = createOrderedFakeDb(rows);
    await expect(fetchMetricSnapshotSeries(db, ["basin"])).resolves.toEqual(
      rows,
    );
    expect(orderBy).toHaveBeenCalled();
  });
});

describe("breakdownBatchStart", () => {
  it("is exactly 5 minutes before the given capture", () => {
    const capturedAt = new Date("2026-09-19T10:02:00Z");
    expect(breakdownBatchStart(capturedAt).toISOString()).toBe(
      new Date("2026-09-19T09:57:00Z").toISOString(),
    );
  });
});

describe("fetchLatestTrafficBreakdowns", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, select } = createTrafficBreakdownFakeDb([], []);
    expect(await fetchLatestTrafficBreakdowns(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns an empty array without a second query when no slug has any row", async () => {
    const { db, select } = createTrafficBreakdownFakeDb([], []);
    expect(await fetchLatestTrafficBreakdowns(db, ["basin"])).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("skips a slug whose grouped max capturedAt comes back null, without a second query", async () => {
    const { db, select } = createTrafficBreakdownFakeDb(
      [{ slug: "basin", capturedAt: null }],
      [],
    );
    expect(await fetchLatestTrafficBreakdowns(db, ["basin"])).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("returns the batch of rows near each slug's own most recent capture", async () => {
    const detailRows = [
      {
        id: 1,
        slug: "basin",
        channel: "organic",
        capturedAt: new Date("2026-09-19T00:00:00Z"),
      },
    ];
    const { db, select } = createTrafficBreakdownFakeDb(
      [{ slug: "basin", capturedAt: new Date("2026-09-19T00:00:00Z") }],
      detailRows,
    );

    await expect(fetchLatestTrafficBreakdowns(db, ["basin"])).resolves.toEqual(
      detailRows,
    );
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("keeps only the newest row per channel when the batch contains a duplicate (e.g. a retried poll)", async () => {
    const staleRow = {
      id: 1,
      slug: "basin",
      channel: "organic",
      pct: 60,
      capturedAt: new Date("2026-09-19T10:00:00Z"),
    };
    const freshRow = {
      id: 2,
      slug: "basin",
      channel: "organic",
      pct: 62,
      capturedAt: new Date("2026-09-19T10:02:00Z"),
    };
    const { db } = createTrafficBreakdownFakeDb(
      [{ slug: "basin", capturedAt: new Date("2026-09-19T10:02:00Z") }],
      [staleRow, freshRow],
    );

    await expect(fetchLatestTrafficBreakdowns(db, ["basin"])).resolves.toEqual([
      freshRow,
    ]);
  });
});

describe("fetchSyncStatuses", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, select } = createUnorderedFakeDb([]);
    expect(await fetchSyncStatuses(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns whatever rows the query resolves", async () => {
    const rows = [{ id: 1, vendor: "ga4" }];
    const { db, where } = createUnorderedFakeDb(rows);
    await expect(fetchSyncStatuses(db, ["basin"])).resolves.toEqual(rows);
    expect(where).toHaveBeenCalled();
  });
});

describe("fetchIntegrationConfigs", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, select } = createUnorderedFakeDb([]);
    expect(await fetchIntegrationConfigs(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns whatever rows the query resolves", async () => {
    const rows = [{ id: 1, vendor: "stripe" }];
    const { db, where } = createUnorderedFakeDb(rows);
    await expect(fetchIntegrationConfigs(db, ["basin"])).resolves.toEqual(rows);
    expect(where).toHaveBeenCalled();
  });
});

describe("fetchSyndicationPosts", () => {
  it("queries by the given slug, ordered, and returns the resolved rows", async () => {
    const rows = [{ id: 1, postRef: "post-1" }];
    const { db, where } = createOrderedFakeDb(rows);
    await expect(fetchSyndicationPosts(db, "basin")).resolves.toEqual(rows);
    expect(where).toHaveBeenCalled();
  });
});

// Stubs `select().from().where().orderBy().limit()` — the chain used by
// fetchLatestMetricCapturedAt (medium's rate-limit guard clock).
function createLimitedFakeDb(rows: { capturedAt: Date }[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } as unknown as FakeDb, where, orderBy, limit };
}

describe("fetchLatestMetricCapturedAt", () => {
  it("returns null when no matching metric_snapshot row exists", async () => {
    const { db } = createLimitedFakeDb([]);

    await expect(
      fetchLatestMetricCapturedAt(db, "danholloran", "medium", "posts"),
    ).resolves.toBeNull();
  });

  it("returns the single row's capturedAt when one exists", async () => {
    const capturedAt = new Date("2026-09-20T03:00:00Z");
    const { db, where, limit } = createLimitedFakeDb([{ capturedAt }]);

    await expect(
      fetchLatestMetricCapturedAt(db, "danholloran", "medium", "posts"),
    ).resolves.toEqual(capturedAt);
    expect(where).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(1);
  });
});
