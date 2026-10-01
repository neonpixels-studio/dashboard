import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { APPS } from "../../../../app/config/apps";
import type { MetricSnapshotRow } from "../../../../server/utils/dashboardQueries";

const mockRequireUser = vi.fn();
vi.mock("../../../../server/utils/auth", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("../../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchLatestMetricSnapshots = vi.fn();
const mockFetchMetricSnapshotSeries = vi.fn();
vi.mock("../../../../server/utils/dashboardQueries", () => ({
  fetchLatestMetricSnapshots: mockFetchLatestMetricSnapshots,
  fetchMetricSnapshotSeries: mockFetchMetricSnapshotSeries,
}));

const { default: sessionsHandler } =
  await import("../../../../server/api/overview/sessions.get");

function metricRow(overrides: Partial<MetricSnapshotRow>): MetricSnapshotRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "ga4",
    metric: "sessions",
    value: 100,
    period: "daily",
    capturedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("GET /api/overview/sessions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchLatestMetricSnapshots.mockResolvedValue([]);
    mockFetchMetricSnapshotSeries.mockResolvedValue([]);
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(sessionsHandler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchMetricSnapshotSeries).not.toHaveBeenCalled();
  });

  it("returns an entry per configured app, empty and null when nothing has synced", async () => {
    const result = await sessionsHandler({} as H3Event);

    expect(result).toEqual(
      APPS.map((app) => ({
        slug: app.slug,
        daily: [],
        total30d: null,
        delta: null,
      })),
    );
  });

  it("shapes each app's daily series, 30d total, and delta from stored rows", async () => {
    mockFetchMetricSnapshotSeries.mockResolvedValue([
      metricRow({
        id: 1,
        value: 10,
        capturedAt: new Date("2026-09-01T00:00:00Z"),
      }),
      metricRow({
        id: 2,
        value: 30,
        capturedAt: new Date("2026-09-02T00:00:00Z"),
      }),
      metricRow({
        id: 3,
        period: "30d",
        value: 200,
        capturedAt: new Date("2026-09-01T00:00:00Z"),
      }),
      metricRow({
        id: 4,
        period: "30d",
        value: 250,
        capturedAt: new Date("2026-09-02T00:00:00Z"),
      }),
      metricRow({ id: 5, slug: "markpost", value: 7 }),
    ]);
    mockFetchLatestMetricSnapshots.mockResolvedValue([
      metricRow({
        id: 4,
        period: "30d",
        value: 250,
        capturedAt: new Date("2026-09-02T00:00:00Z"),
      }),
    ]);

    const result = await sessionsHandler({} as H3Event);
    const basin = result.find((entry) => entry.slug === "basin");
    const markpost = result.find((entry) => entry.slug === "markpost");

    expect(basin).toEqual({
      slug: "basin",
      daily: [
        { capturedAt: "2026-09-01T00:00:00.000Z", value: 10 },
        { capturedAt: "2026-09-02T00:00:00.000Z", value: 30 },
      ],
      total30d: 250,
      delta: { value: 50, pct: 25 },
    });
    expect(markpost).toMatchObject({
      daily: [{ value: 7 }],
      total30d: null,
      delta: null,
    });
  });
});
