import { describe, expect, it, vi } from "vitest";
import {
  fetchIntegrationConfigs,
  fetchMetricSnapshots,
  fetchSyncStatuses,
  fetchSyndicationPosts,
  fetchTrafficBreakdowns,
} from "../../../server/utils/dashboardQueries";

type FakeDb = Parameters<typeof fetchMetricSnapshots>[0];

// Stubs `select().from().where().orderBy()` — the chain used by the two
// history-window fetches (metric_snapshot, traffic_breakdown).
function createOrderedFakeDb(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } as unknown as FakeDb, select, from, where, orderBy };
}

// Stubs `select().from().where()` — the chain used by the "current only, no
// history" fetches (syndication_post, sync_status, integration_config).
function createUnorderedFakeDb(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select } as unknown as FakeDb, select, from, where };
}

describe("fetchMetricSnapshots", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, select } = createOrderedFakeDb([]);
    expect(await fetchMetricSnapshots(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns whatever rows the query resolves, ordered ascending", async () => {
    const rows = [{ id: 1 }];
    const { db, orderBy } = createOrderedFakeDb(rows);
    await expect(fetchMetricSnapshots(db, ["basin"])).resolves.toEqual(rows);
    expect(orderBy).toHaveBeenCalled();
  });
});

describe("fetchTrafficBreakdowns", () => {
  it("never touches the db for an empty slug list", async () => {
    const { db, select } = createOrderedFakeDb([]);
    expect(await fetchTrafficBreakdowns(db, [])).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns whatever rows the query resolves", async () => {
    const rows = [{ id: 1, channel: "organic" }];
    const { db, orderBy } = createOrderedFakeDb(rows);
    await expect(fetchTrafficBreakdowns(db, ["basin"])).resolves.toEqual(rows);
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
  it("queries by the given slug and returns the resolved rows", async () => {
    const rows = [{ id: 1, postRef: "post-1" }];
    const { db, where } = createUnorderedFakeDb(rows);
    await expect(fetchSyndicationPosts(db, "basin")).resolves.toEqual(rows);
    expect(where).toHaveBeenCalled();
  });
});
