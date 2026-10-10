import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { H3Event } from "h3";
import { APPS, INTERNAL_APPS } from "../../../app/config/apps";
import type { MetricSnapshotRow } from "../../../server/utils/dashboardQueries";

// getQuery needs a real H3 event; every test here passes a bare `{}`, so the
// query is stubbed per test (default: no query string at all).
const mockGetQuery = vi.fn();
vi.mock("h3", () => ({ getQuery: mockGetQuery }));

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
    mockGetQuery.mockReturnValue({});
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

  describe("range query param", () => {
    const NOW = new Date("2026-09-20T12:00:00Z");

    // One mrr row per day for 60 days, ascending 1/day, so a window's first
    // point value says exactly how many days back it starts.
    function sixtyDaysOfMrr() {
      return Array.from({ length: 60 }, (_, index) => {
        const capturedAt = new Date(NOW);
        capturedAt.setUTCDate(capturedAt.getUTCDate() - (59 - index));
        capturedAt.setUTCHours(0, 0, 0, 0);
        return metricRow({ id: index + 1, value: 1000 + index, capturedAt });
      });
    }

    it.each([
      [7, 7],
      [30, 30],
      [60, 60],
    ])("range=%i windows the mrr series to %i days", async (range, points) => {
      vi.setSystemTime(NOW);
      mockGetQuery.mockReturnValue({ range: String(range) });
      mockFetchMetricSnapshotSeries.mockResolvedValue(sixtyDaysOfMrr());

      const result = await overviewHandler({} as H3Event);

      expect(result.mrr.series).toHaveLength(points);
      // 1059 is today's value; the window's first point is (points - 1) back.
      expect(result.mrr.delta?.value).toBe(points - 1);
    });

    it.each([undefined, "", "90", "abc", "7;DROP", ["7", "60"]])(
      "falls back to the 30 day window for invalid range %j",
      async (range) => {
        vi.setSystemTime(NOW);
        mockGetQuery.mockReturnValue({ range });
        mockFetchMetricSnapshotSeries.mockResolvedValue(sixtyDaysOfMrr());

        const result = await overviewHandler({} as H3Event);

        expect(result.mrr.series).toHaveLength(30);
      },
    );

    it("re-windows the sessions total from stored daily rows per range", async () => {
      vi.setSystemTime(NOW);
      // 1 session/day for 30 days of GA4 daily rows, plus the vendor's own
      // fixed 30d total (deliberately different, 9999) which must NOT leak
      // into a non-default range.
      const dailyRows = Array.from({ length: 30 }, (_, index) => {
        const capturedAt = new Date("2026-09-20T00:00:00Z");
        capturedAt.setUTCDate(capturedAt.getUTCDate() - index);
        return metricRow({
          id: 100 + index,
          vendor: "ga4",
          metric: "sessions",
          period: "daily",
          value: 10,
          capturedAt,
        });
      });
      const vendorTotal = metricRow({
        id: 99,
        vendor: "ga4",
        metric: "sessions",
        period: "30d",
        value: 9999,
        capturedAt: NOW,
      });
      mockFetchLatestMetricSnapshots.mockResolvedValue([vendorTotal]);
      mockFetchMetricSnapshotSeries.mockResolvedValue(dailyRows);

      const totals: Record<number, number | null> = {};
      for (const range of [7, 30, 60]) {
        mockGetQuery.mockReturnValue({ range: String(range) });
        const result = await overviewHandler({} as H3Event);
        totals[range] = result.sessions30d.value;
        expect(result.sessions30d.period).toBe(`${range}d`);
      }

      expect(totals).toEqual({ 7: 70, 30: 300, 60: 300 });
    });

    it("keeps the vendor 30d total at the default range when no daily rows exist, and shows nothing for other ranges", async () => {
      vi.setSystemTime(NOW);
      mockFetchLatestMetricSnapshots.mockResolvedValue([
        metricRow({
          vendor: "ga4",
          metric: "sessions",
          period: "30d",
          value: 9999,
          capturedAt: NOW,
        }),
      ]);

      const defaultResult = await overviewHandler({} as H3Event);
      expect(defaultResult.sessions30d.value).toBe(9999);
      expect(defaultResult.sessions30d.period).toBe("30d");

      mockGetQuery.mockReturnValue({ range: "7" });
      const sevenDayResult = await overviewHandler({} as H3Event);
      expect(sevenDayResult.sessions30d.value).toBeNull();
    });

    it("leaves the open issues since-yesterday window fixed regardless of range", async () => {
      vi.setSystemTime(NOW);
      mockGetQuery.mockReturnValue({ range: "60" });
      const issueRows = [
        [new Date("2026-08-01T00:00:00Z"), 1],
        [new Date("2026-09-19T00:00:00Z"), 4],
        [new Date("2026-09-20T00:00:00Z"), 6],
      ].map(([capturedAt, value], index) =>
        metricRow({
          id: index + 1,
          metric: "open_issues",
          value: value as number,
          capturedAt: capturedAt as Date,
        }),
      );
      mockFetchMetricSnapshotSeries.mockResolvedValue(issueRows);

      const result = await overviewHandler({} as H3Event);

      expect(result.openIssues.delta).toEqual({ value: 2, pct: 50 });
    });
  });

  it("computes open issues' since-yesterday delta from just the last two calendar days of the series", async () => {
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

  it("fetches metrics scoped to every property plus internal app slug, traffic to properties only", async () => {
    await overviewHandler({} as H3Event);

    const propertySlugs = APPS.map((app) => app.slug);
    const issueSlugs = [
      ...propertySlugs,
      ...INTERNAL_APPS.map((app) => app.slug),
    ];
    expect(mockFetchLatestMetricSnapshots).toHaveBeenCalledWith({}, issueSlugs);
    expect(mockFetchMetricSnapshotSeries).toHaveBeenCalledWith({}, issueSlugs);
    expect(mockFetchLatestTrafficBreakdowns).toHaveBeenCalledWith(
      {},
      propertySlugs,
    );
    expect(mockFetchSyncStatuses).toHaveBeenCalledWith({}, issueSlugs);
  });

  it("counts the dashboard's own Sentry issues in open issues, but in no property-only rollup", async () => {
    mockFetchLatestMetricSnapshots.mockResolvedValue([
      metricRow({
        slug: "basin",
        vendor: "sentry",
        metric: "open_issues",
        value: 3,
      }),
      metricRow({
        slug: "dashboard",
        vendor: "sentry",
        metric: "open_issues",
        value: 2,
      }),
      metricRow({ slug: "dashboard", vendor: "stripe", value: 999 }),
    ]);

    const result = await overviewHandler({} as H3Event);

    expect(result.openIssues.value).toBe(5);
    expect(result.openIssues.byApp).toEqual([
      { slug: "basin", value: 3 },
      { slug: "dashboard", value: 2 },
    ]);
    expect(result.mrr.value).toBeNull();
    expect(result.mrr.byApp).toEqual([]);
  });
});
