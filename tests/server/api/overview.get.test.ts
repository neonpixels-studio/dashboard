import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { APPS } from "../../../app/config/apps";
import type { MetricSnapshotRow } from "../../../server/utils/dashboardQueries";

const mockRequireUser = vi.fn();
vi.mock("../../../server/utils/auth", () => ({ requireUser: mockRequireUser }));

vi.mock("../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchLatestMetricSnapshots = vi.fn();
const mockFetchLatestTrafficBreakdowns = vi.fn();
const mockFetchSyncStatuses = vi.fn();
vi.mock("../../../server/utils/dashboardQueries", () => ({
  fetchLatestMetricSnapshots: mockFetchLatestMetricSnapshots,
  fetchLatestTrafficBreakdowns: mockFetchLatestTrafficBreakdowns,
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
    mockFetchLatestMetricSnapshots.mockResolvedValue([]);
    mockFetchLatestTrafficBreakdowns.mockResolvedValue([]);
    mockFetchSyncStatuses.mockResolvedValue([]);
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(overviewHandler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchLatestMetricSnapshots).not.toHaveBeenCalled();
  });

  it("returns a fully null/empty shape when the db has no rows yet", async () => {
    const result = await overviewHandler({} as H3Event);

    expect(result).toEqual({
      mrr: { value: null, period: null, capturedAt: null, byApp: [] },
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
    mockFetchLatestMetricSnapshots.mockResolvedValue([basinRow, markpostRow]);

    const result = await overviewHandler({} as H3Event);

    expect(result.mrr).toEqual({
      value: 1003,
      period: "current",
      capturedAt: markpostRow.capturedAt.toISOString(),
      byApp: [
        { slug: "basin", value: 412 },
        { slug: "markpost", value: 591 },
      ],
    });
  });

  it("only sums sessions at the 30d period, ignoring a 7d row for the same metric", async () => {
    mockFetchLatestMetricSnapshots.mockResolvedValue([
      metricRow({
        slug: "basin",
        metric: "sessions",
        period: "7d",
        value: 900,
      }),
      metricRow({
        slug: "markpost",
        metric: "sessions",
        period: "30d",
        value: 12400,
      }),
    ]);

    const result = await overviewHandler({} as H3Event);

    expect(result.sessions30d.value).toBe(12400);
    expect(result.sessions30d.period).toBe("30d");
  });

  it("weighs the studio-wide traffic split by each app's sessions", async () => {
    mockFetchLatestMetricSnapshots.mockResolvedValue([
      metricRow({
        slug: "danholloran",
        vendor: "ga4",
        metric: "sessions",
        period: "30d",
        value: 12400,
      }),
      metricRow({
        slug: "neonpixels",
        vendor: "ga4",
        metric: "sessions",
        period: "30d",
        value: 6100,
      }),
    ]);
    mockFetchLatestTrafficBreakdowns.mockResolvedValue([
      {
        id: 1,
        slug: "danholloran",
        channel: "organic",
        pct: 80,
        capturedAt: new Date("2026-09-01T00:00:00Z"),
      },
      {
        id: 2,
        slug: "neonpixels",
        channel: "organic",
        pct: 20,
        capturedAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

    const result = await overviewHandler({} as H3Event);

    expect(result.sessions30d.bySource).toEqual([
      { channel: "organic", pct: 60.22 },
    ]);
  });

  it("fetches metrics scoped to every configured app slug", async () => {
    await overviewHandler({} as H3Event);

    const expectedSlugs = APPS.map((app) => app.slug);
    expect(mockFetchLatestMetricSnapshots).toHaveBeenCalledWith(
      {},
      expectedSlugs,
    );
    expect(mockFetchLatestTrafficBreakdowns).toHaveBeenCalledWith(
      {},
      expectedSlugs,
    );
    expect(mockFetchSyncStatuses).toHaveBeenCalledWith({}, expectedSlugs);
  });
});
