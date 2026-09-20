import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { APPS } from "../../../app/config/apps";
import type { MetricSnapshotRow } from "../../../server/utils/dashboardQueries";

const mockRequireUser = vi.fn();
vi.mock("../../../server/utils/auth", () => ({ requireUser: mockRequireUser }));

vi.mock("../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchMetricSnapshots = vi.fn();
const mockFetchTrafficBreakdowns = vi.fn();
const mockFetchSyncStatuses = vi.fn();
vi.mock("../../../server/utils/dashboardQueries", () => ({
  fetchMetricSnapshots: mockFetchMetricSnapshots,
  fetchTrafficBreakdowns: mockFetchTrafficBreakdowns,
  fetchSyncStatuses: mockFetchSyncStatuses,
}));

const { default: overviewHandler } =
  await import("../../../server/api/overview.get");

function metricRow(overrides: Partial<MetricSnapshotRow>): MetricSnapshotRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "stripe",
    metric: "mrr",
    value: 100,
    period: "current",
    capturedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("GET /api/overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMetricSnapshots.mockResolvedValue([]);
    mockFetchTrafficBreakdowns.mockResolvedValue([]);
    mockFetchSyncStatuses.mockResolvedValue([]);
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(overviewHandler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchMetricSnapshots).not.toHaveBeenCalled();
  });

  it("returns a fully null/empty shape when the db has no rows yet", async () => {
    const result = await overviewHandler({} as H3Event);

    expect(result).toEqual({
      mrr: { value: null, period: null, capturedAt: null },
      activeSubscribers: {
        value: null,
        period: null,
        capturedAt: null,
        byApp: [],
      },
      sessions30d: {
        value: null,
        period: null,
        capturedAt: null,
        bySource: [],
      },
      openIssues: { value: null, period: null, capturedAt: null, byApp: [] },
      lastSyncedAt: null,
    });
  });

  it("sums the latest mrr across apps that have data, ignoring apps with none", async () => {
    const basinRow = metricRow({
      slug: "basin",
      metric: "mrr",
      value: 412,
      capturedAt: new Date("2026-09-01T00:00:00Z"),
    });
    const markpostRow = metricRow({
      id: 2,
      slug: "markpost",
      metric: "mrr",
      value: 591,
      capturedAt: new Date("2026-09-10T00:00:00Z"),
    });
    mockFetchMetricSnapshots.mockResolvedValue([basinRow, markpostRow]);

    const result = await overviewHandler({} as H3Event);

    expect(result.mrr).toEqual({
      value: 1003,
      period: "current",
      capturedAt: markpostRow.capturedAt.toISOString(),
    });
  });

  it("fetches metrics scoped to every configured app slug", async () => {
    await overviewHandler({} as H3Event);

    const expectedSlugs = APPS.map((app) => app.slug);
    expect(mockFetchMetricSnapshots).toHaveBeenCalledWith({}, expectedSlugs);
    expect(mockFetchTrafficBreakdowns).toHaveBeenCalledWith({}, expectedSlugs);
    expect(mockFetchSyncStatuses).toHaveBeenCalledWith({}, expectedSlugs);
  });
});
