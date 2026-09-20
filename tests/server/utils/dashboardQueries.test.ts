import { describe, expect, it, vi } from "vitest";
import {
  fetchIntegrationConfigs,
  fetchLatestMetricSnapshots,
  fetchLatestTrafficBreakdowns,
  fetchMetricSnapshotSeries,
  fetchSyncStatuses,
  fetchSyndicationPosts,
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
// the unbounded "latest per group" fetches (metric_snapshot,
// traffic_breakdown).
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

describe("fetchLatestTrafficBreakdowns", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, selectDistinctOn } = createDistinctFakeDb([]);
    expect(await fetchLatestTrafficBreakdowns(db, [])).toEqual([]);
    expect(selectDistinctOn).not.toHaveBeenCalled();
  });

  it("returns whatever rows the query resolves", async () => {
    const rows = [{ id: 1, channel: "organic" }];
    const { db, orderBy } = createDistinctFakeDb(rows);
    await expect(fetchLatestTrafficBreakdowns(db, ["basin"])).resolves.toEqual(
      rows,
    );
    expect(orderBy).toHaveBeenCalled();
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
