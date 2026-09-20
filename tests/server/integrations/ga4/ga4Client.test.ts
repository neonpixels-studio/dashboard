import { describe, expect, it, vi } from "vitest";
import type { BetaAnalyticsDataClient } from "@google-analytics/data";
import {
  createGa4ReportRunner,
  normalizeServiceAccountPrivateKey,
} from "../../../../server/integrations/ga4/ga4Client";

function buildStubGa4Client(
  runReport: BetaAnalyticsDataClient["runReport"],
): Pick<BetaAnalyticsDataClient, "runReport"> {
  return { runReport };
}

describe("normalizeServiceAccountPrivateKey", () => {
  it("turns literal \\n escapes into real newlines", () => {
    expect(normalizeServiceAccountPrivateKey("line1\\nline2")).toBe(
      "line1\nline2",
    );
  });

  it("is a no-op on a key that already has real newlines", () => {
    expect(normalizeServiceAccountPrivateKey("line1\nline2")).toBe(
      "line1\nline2",
    );
  });
});

describe("createGa4ReportRunner", () => {
  it("requests the property, date range, dimension, and sessions metric", async () => {
    const runReport = vi.fn(async () => [{ rows: [] }]);
    const runGa4Report = createGa4ReportRunner(
      { clientEmail: "sa@example.com", privateKey: "unused" },
      buildStubGa4Client(runReport as never),
    );

    await runGa4Report({
      propertyId: "123456",
      dimension: "date",
      startDate: "29daysAgo",
      endDate: "today",
    });

    expect(runReport).toHaveBeenCalledWith(
      {
        property: "properties/123456",
        dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }],
      },
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("maps report rows to plain dimensionValue/metricValue pairs", async () => {
    const runReport = vi.fn(async () => [
      {
        rows: [
          {
            dimensionValues: [{ value: "20260919" }],
            metricValues: [{ value: "142" }],
          },
          {
            dimensionValues: [{ value: "20260918" }],
            metricValues: [{ value: "98" }],
          },
        ],
      },
    ]);
    const runGa4Report = createGa4ReportRunner(
      { clientEmail: "sa@example.com", privateKey: "unused" },
      buildStubGa4Client(runReport as never),
    );

    const rows = await runGa4Report({
      propertyId: "123456",
      dimension: "date",
      startDate: "29daysAgo",
      endDate: "today",
    });

    expect(rows).toEqual([
      { dimensionValue: "20260919", metricValue: "142" },
      { dimensionValue: "20260918", metricValue: "98" },
    ]);
  });

  it("returns an empty list when the response has no rows", async () => {
    const runReport = vi.fn(async () => [{ rows: undefined }]);
    const runGa4Report = createGa4ReportRunner(
      { clientEmail: "sa@example.com", privateKey: "unused" },
      buildStubGa4Client(runReport as never),
    );

    const rows = await runGa4Report({
      propertyId: "123456",
      dimension: "sessionDefaultChannelGrouping",
      startDate: "29daysAgo",
      endDate: "today",
    });

    expect(rows).toEqual([]);
  });
});
