import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const mockRequireUser = vi.fn();
vi.mock("../../../../server/utils/auth", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("../../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchMetricSnapshots = vi.fn();
const mockFetchTrafficBreakdowns = vi.fn();
const mockFetchSyncStatuses = vi.fn();
const mockFetchSyndicationPosts = vi.fn();
vi.mock("../../../../server/utils/dashboardQueries", () => ({
  fetchMetricSnapshots: mockFetchMetricSnapshots,
  fetchTrafficBreakdowns: mockFetchTrafficBreakdowns,
  fetchSyncStatuses: mockFetchSyncStatuses,
  fetchSyndicationPosts: mockFetchSyndicationPosts,
}));

const { default: appDetailHandler } =
  await import("../../../../server/api/apps/[slug].get");

function makeEvent(slug?: string): H3Event {
  return { context: { params: slug ? { slug } : {} } } as unknown as H3Event;
}

describe("GET /api/apps/[slug]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMetricSnapshots.mockResolvedValue([]);
    mockFetchTrafficBreakdowns.mockResolvedValue([]);
    mockFetchSyncStatuses.mockResolvedValue([]);
    mockFetchSyndicationPosts.mockResolvedValue([]);
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(appDetailHandler(makeEvent("basin"))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchMetricSnapshots).not.toHaveBeenCalled();
  });

  it("404s for a slug that isn't in app/config/apps.ts", async () => {
    await expect(
      appDetailHandler(makeEvent("not-a-real-app")),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockFetchMetricSnapshots).not.toHaveBeenCalled();
  });

  it("404s when no slug param is present", async () => {
    await expect(appDetailHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns an empty/null-metric shape when the db has no rows for the app yet", async () => {
    const result = await appDetailHandler(makeEvent("basin"));

    expect(result).toEqual({
      slug: "basin",
      metrics: [],
      series: [],
      trafficBreakdown: [],
      syndication: [],
      alerts: [],
      sources: [],
      lastSyncedAt: null,
    });
  });

  it("scopes every fetch to the requested slug", async () => {
    await appDetailHandler(makeEvent("basin"));

    expect(mockFetchMetricSnapshots).toHaveBeenCalledWith({}, ["basin"]);
    expect(mockFetchTrafficBreakdowns).toHaveBeenCalledWith({}, ["basin"]);
    expect(mockFetchSyncStatuses).toHaveBeenCalledWith({}, ["basin"]);
    expect(mockFetchSyndicationPosts).toHaveBeenCalledWith({}, "basin");
  });

  it("surfaces a failing vendor as both an alert and a source", async () => {
    mockFetchSyncStatuses.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "sentry",
        lastRunAt: new Date("2026-09-19T00:00:00Z"),
        lastSuccessAt: null,
        ok: false,
        error: "rate limited",
      },
    ]);

    const result = await appDetailHandler(makeEvent("basin"));

    expect(result.alerts).toEqual([
      {
        slug: "basin",
        vendor: "sentry",
        message: "rate limited",
        occurredAt: new Date("2026-09-19T00:00:00Z").toISOString(),
      },
    ]);
    expect(result.sources).toEqual([
      {
        vendor: "sentry",
        ok: false,
        lastRunAt: new Date("2026-09-19T00:00:00Z").toISOString(),
        lastSuccessAt: null,
        error: "rate limited",
      },
    ]);
    expect(result.lastSyncedAt).toBeNull();
  });
});
