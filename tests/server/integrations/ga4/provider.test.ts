import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGa4Metrics,
  ga4Provider,
} from "../../../../server/integrations/ga4/provider";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type {
  Ga4ReportRow,
  RunGa4Report,
} from "../../../../server/integrations/ga4/types";

// Only ga4Provider.fetch's own wiring (guard clauses + delegate to
// fetchGa4Metrics) needs the real "@google-analytics/data" package mocked —
// every other test in this file exercises fetchGa4Metrics directly with an
// injected RunGa4Report fake and never touches the network.
const { mockRunReport } = vi.hoisted(() => ({
  mockRunReport: vi.fn(),
}));
vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: class MockBetaAnalyticsDataClient {
    runReport = mockRunReport;
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  mockRunReport.mockReset();
});

function buildRunGa4Report(
  dailyRows: Ga4ReportRow[],
  channelRows: Ga4ReportRow[],
): RunGa4Report {
  return vi.fn(async ({ dimension }) =>
    dimension === "date" ? dailyRows : channelRows,
  );
}

describe("ga4Provider", () => {
  it("identifies itself as the ga4 vendor", () => {
    expect(ga4Provider.vendor).toBe("ga4");
  });

  it("throws when the config has no secret (private key) configured", async () => {
    vi.stubEnv("NUXT_GA4_SA_CLIENT_EMAIL", "sa@example.com");
    const config = createTestIntegrationConfig({
      vendor: "ga4",
      externalId: "123456",
      secret: null,
    });

    await expect(ga4Provider.fetch(config)).rejects.toThrow(
      /no service account private key configured/,
    );
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it("throws when NUXT_GA4_SA_CLIENT_EMAIL is not configured", async () => {
    vi.stubEnv("NUXT_GA4_SA_CLIENT_EMAIL", "");
    const config = createTestIntegrationConfig({
      vendor: "ga4",
      externalId: "123456",
      secret: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    });

    await expect(ga4Provider.fetch(config)).rejects.toThrow(
      /NUXT_GA4_SA_CLIENT_EMAIL/,
    );
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it("end-to-end: builds a real GA4 client from config.secret and returns normalized metrics", async () => {
    vi.stubEnv("NUXT_GA4_SA_CLIENT_EMAIL", "sa@example.com");
    mockRunReport.mockResolvedValue([
      {
        rows: [
          {
            dimensionValues: [{ value: "20260919" }],
            metricValues: [{ value: "100" }],
          },
        ],
      },
    ]);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: "123456",
      secret: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    });

    const result = await ga4Provider.fetch(config);

    expect(mockRunReport).toHaveBeenCalledWith(
      expect.objectContaining({ property: "properties/123456" }),
      expect.anything(),
    );
    const sessionsMetric = result.metrics.find(
      (metric) => metric.period === "30d",
    );
    expect(sessionsMetric?.value).toBe(100);
  });
});

describe("fetchGa4Metrics", () => {
  it("returns no rows (not zeros) for an unconfigured app, without calling GA4 at all", async () => {
    const config = createTestIntegrationConfig({
      vendor: "ga4",
      externalId: null,
      secret: "unused",
    });
    const runGa4Report = vi.fn();

    const result = await fetchGa4Metrics(config, runGa4Report);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(runGa4Report).not.toHaveBeenCalled();
  });

  it("returns no rows for a blank property-id string, same as null", async () => {
    const config = createTestIntegrationConfig({
      vendor: "ga4",
      externalId: "   ",
      secret: "unused",
    });
    const runGa4Report = vi.fn();

    const result = await fetchGa4Metrics(config, runGa4Report);

    expect(result.metrics).toEqual([]);
    expect(runGa4Report).not.toHaveBeenCalled();
  });

  it("falls back to the shared NUXT_GA4_PROPERTY_ID_<SLUG> env var when integration_config.external_id is unset", async () => {
    vi.stubEnv("NUXT_GA4_PROPERTY_ID_BASIN", "123456");
    const runGa4Report = vi.fn(async () => []);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: null,
      secret: "unused",
    });

    await fetchGa4Metrics(config, runGa4Report);

    expect(runGa4Report).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: "123456" }),
    );
  });

  it("trims and ignores a whitespace-only env var, same as an unset one", async () => {
    vi.stubEnv("NUXT_GA4_PROPERTY_ID_BASIN", "   ");
    const runGa4Report = vi.fn();
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: null,
      secret: "unused",
    });

    const result = await fetchGa4Metrics(config, runGa4Report);

    expect(result.metrics).toEqual([]);
    expect(runGa4Report).not.toHaveBeenCalled();
  });

  it("prefers integration_config.external_id over the env var when both are set", async () => {
    vi.stubEnv("NUXT_GA4_PROPERTY_ID_BASIN", "999999");
    const runGa4Report = vi.fn(async () => []);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: "123456",
      secret: "unused",
    });

    await fetchGa4Metrics(config, runGa4Report);

    expect(runGa4Report).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: "123456" }),
    );
    expect(runGa4Report).not.toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: "999999" }),
    );
  });

  it("emits a 30d sessions total, a daily series, and a bucketed traffic breakdown for a configured app", async () => {
    const dailyRows = await loadFixture<Ga4ReportRow[]>(
      "ga4",
      "daily-sessions-30d",
    );
    const channelRows = await loadFixture<Ga4ReportRow[]>(
      "ga4",
      "channel-split-30d",
    );
    const runGa4Report = buildRunGa4Report(dailyRows, channelRows);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: "123456",
      secret: "unused",
    });

    const result = await fetchGa4Metrics(config, runGa4Report);

    expect(result.syndicationPosts).toEqual([]);

    const totalMetric = result.metrics.find(
      (metric) => metric.period === "30d",
    );
    expect(totalMetric).toMatchObject({
      vendor: "ga4",
      metric: "sessions",
      value: 3320,
      period: "30d",
    });

    const dailyMetrics = result.metrics.filter(
      (metric) => metric.period === "daily",
    );
    expect(dailyMetrics).toHaveLength(dailyRows.length);
    // These fixtures were deliberately built so the daily series sums to
    // the same total as the channel-derived total above — that's a fixture
    // choice, not a guarantee the code makes (the two are independently
    // scoped; see provider.ts's REPORT_START_DATE comment for why).
    expect(
      dailyMetrics.reduce((sum, metric) => sum + Number(metric.value), 0),
    ).toBe(3320);

    expect(result.trafficBreakdown).toHaveLength(4);
    const pctSum = result.trafficBreakdown.reduce(
      (sum, breakdown) => sum + Number(breakdown.pct),
      0,
    );
    expect(pctSum).toBeCloseTo(100, 1);
    for (const breakdown of result.trafficBreakdown) {
      expect(breakdown.capturedAt).toBe(totalMetric?.capturedAt);
    }
  });

  it("requests the daily and channel reports over the same complete-days window", async () => {
    const runGa4Report = vi.fn(async () => []);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: "123456",
      secret: "unused",
    });

    await fetchGa4Metrics(config, runGa4Report);

    // Both reports must share one window — if the channel report (the
    // total/split source) and the date report (the sparkline source) ever
    // drifted onto different windows again, they'd cover different sets of
    // days entirely. "yesterday", not "today", so the series' last point is
    // never a still-accumulating partial day.
    expect(runGa4Report).toHaveBeenCalledWith({
      propertyId: "123456",
      dimension: "date",
      startDate: "30daysAgo",
      endDate: "yesterday",
    });
    expect(runGa4Report).toHaveBeenCalledWith({
      propertyId: "123456",
      dimension: "sessionDefaultChannelGrouping",
      startDate: "30daysAgo",
      endDate: "yesterday",
    });
  });

  it("skips the traffic breakdown entirely when there are zero sessions", async () => {
    const noSessions = await loadFixture<Ga4ReportRow[]>("ga4", "no-sessions");
    const runGa4Report = buildRunGa4Report(noSessions, noSessions);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: "123456",
      secret: "unused",
    });

    const result = await fetchGa4Metrics(config, runGa4Report);

    const totalMetric = result.metrics.find(
      (metric) => metric.period === "30d",
    );
    expect(totalMetric?.value).toBe(0);
    expect(
      result.metrics.filter((metric) => metric.period === "daily"),
    ).toEqual([]);
    expect(result.trafficBreakdown).toEqual([]);
  });

  it("throws instead of reporting a 0 sessions total when the channel report is empty but the date report isn't", async () => {
    const dailyRows = await loadFixture<Ga4ReportRow[]>(
      "ga4",
      "daily-sessions-30d",
    );
    const runGa4Report = buildRunGa4Report(dailyRows, []);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: "123456",
      secret: "unused",
    });

    await expect(fetchGa4Metrics(config, runGa4Report)).rejects.toThrow(
      /channel report for "basin" returned no rows/,
    );
  });

  it("starts the daily and channel-split requests together (Promise.all), not one after the other", async () => {
    const startedDimensions: string[] = [];
    const pendingResolvers: Record<string, (rows: Ga4ReportRow[]) => void> = {};
    const runGa4Report: RunGa4Report = vi.fn(({ dimension }) => {
      startedDimensions.push(dimension);
      return new Promise((resolve) => {
        pendingResolvers[dimension] = resolve;
      });
    });
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "ga4",
      externalId: "123456",
      secret: "unused",
    });

    const resultPromise = fetchGa4Metrics(config, runGa4Report);
    // Flush the microtask queue without resolving either request. A
    // sequential `await` implementation would only have started the first
    // request by this point; Promise.all starts both before awaiting either.
    await Promise.resolve();
    await Promise.resolve();

    expect(startedDimensions.sort()).toEqual(
      ["date", "sessionDefaultChannelGrouping"].sort(),
    );

    pendingResolvers.date([]);
    pendingResolvers.sessionDefaultChannelGrouping([]);
    await resultPromise;
  });
});
