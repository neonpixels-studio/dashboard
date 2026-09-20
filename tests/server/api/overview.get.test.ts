import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { H3Event } from "h3";
import { APPS } from "../../../app/config/apps";
import type { MetricSnapshotRow } from "../../../server/utils/dashboardQueries";

const mockRequireUser = vi.fn();
vi.mock("../../../server/utils/auth", () => ({ requireUser: mockRequireUser }));

vi.mock("../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchLatestMetricSnapshots = vi.fn();
const mockFetchMetricSnapshotSeries = vi.fn();
const mockFetchLatestTrafficBreakdowns = vi.fn();
const mockFetchSyncStatuses = vi.fn();
vi.mock("../../../server/utils/dashboardQueries", () => ({
  fetchLatestMetricSnapshots: mockFetchLatestMetricSnapshots,
  fetchMetricSnapshotSeries: mockFetchMetricSnapshotSeries,
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
    mockFetchMetricSnapshotSeries.mockResolvedValue([]);
    mockFetchLatestTrafficBreakdowns.mockResolvedValue([]);
    mockFetchSyncStatuses.mockResolvedValue([]);
  });

  // Two tests below pin `now` with vi.setSystemTime for deterministic
  // date-window boundaries. Restoring real timers here (not in-body, after
  // each assertion) means a failed assertion can't skip the restore and
  // leak a frozen clock into every test that runs after it.
  afterEach(() => {
    vi.useRealTimers();
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
      mrr: {
        value: null,
        period: null,
        capturedAt: null,
        delta: null,
        byApp: [],
        series: [],
      },
      activeSubscribers: {
        value: null,
        period: null,
        capturedAt: null,
        delta: null,
        byApp: [],
      },
      sessions30d: {
        value: null,
        period: null,
        capturedAt: null,
        delta: null,
        bySource: [],
      },
      openIssues: {
        value: null,
        period: null,
        capturedAt: null,
        delta: null,
        byApp: [],
      },
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
      delta: null,
      byApp: [
        { slug: "basin", value: 412 },
        { slug: "markpost", value: 591 },
      ],
      series: [],
    });
  });

  it("builds the mrr sparkline and delta from the windowed series fetch, not the latest-only fetch", async () => {
    // Both rollupSeriesAcrossApps window checks default to `new Date()`, so
    // this pins "now" to keep the fixture's dates inside/outside the window
    // deterministically regardless of the day the suite actually runs.
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));

    const seriesRows = [
      metricRow({
        slug: "basin",
        metric: "mrr",
        value: 1000,
        capturedAt: new Date("2026-08-25T00:00:00Z"),
      }),
      metricRow({
        slug: "basin",
        metric: "mrr",
        value: 1082,
        capturedAt: new Date("2026-09-19T00:00:00Z"),
      }),
    ];
    mockFetchMetricSnapshotSeries.mockResolvedValue(seriesRows);

    const result = await overviewHandler({} as H3Event);

    // The series carries basin's value forward through every day between
    // the two rows (see rollupSeriesAcrossApps), so it's asserted by its
    // boundaries rather than the full day-by-day array: it starts at the
    // first row's own value and ends at the second row's value, carried
    // through to "today".
    expect(result.mrr.series[0]).toEqual({
      capturedAt: seriesRows[0].capturedAt.toISOString(),
      value: 1000,
    });
    expect(result.mrr.series.at(-1)).toEqual({
      capturedAt: "2026-09-20T00:00:00.000Z",
      value: 1082,
    });
    expect(result.mrr.delta).toEqual({ value: 82, pct: 8.2 });
  });

  it("computes 'new today' for open issues from just the last two days of the series", async () => {
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));

    mockFetchMetricSnapshotSeries.mockResolvedValue([
      metricRow({
        slug: "basin",
        metric: "open_issues",
        value: 5,
        capturedAt: new Date("2026-08-01T00:00:00Z"),
      }),
      metricRow({
        slug: "basin",
        metric: "open_issues",
        value: 6,
        capturedAt: new Date("2026-09-19T00:00:00Z"),
      }),
      metricRow({
        slug: "basin",
        metric: "open_issues",
        value: 8,
        capturedAt: new Date("2026-09-20T00:00:00Z"),
      }),
    ]);

    const result = await overviewHandler({} as H3Event);

    // Only the last two calendar days (6, then 8) are in the comparison
    // window — the 08-01 point is excluded even though it's part of the same
    // metric/period series.
    expect(result.openIssues.delta).toEqual({ value: 2, pct: 33.33 });
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
    expect(mockFetchMetricSnapshotSeries).toHaveBeenCalledWith(
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
