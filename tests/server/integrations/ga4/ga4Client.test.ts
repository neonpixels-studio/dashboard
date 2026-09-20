import { describe, expect, it, vi } from "vitest";
import type { BetaAnalyticsDataClient } from "@google-analytics/data";
import {
  createGa4ReportRunner,
  normalizeServiceAccountPrivateKey,
} from "../../../../server/integrations/ga4/ga4Client";

// Only the memoization test below needs the real "@google-analytics/data"
// module mocked (it deliberately doesn't pass a stub client, to exercise
// createGa4ReportRunner's default parameter) — every other test in this file
// passes an explicit stub client and never touches this.
const { ga4ClientConstructor } = vi.hoisted(() => ({
  ga4ClientConstructor: vi.fn(),
}));
vi.mock("@google-analytics/data", () => ({
  BetaAnalyticsDataClient: class MockBetaAnalyticsDataClient {
    constructor(options: unknown) {
      ga4ClientConstructor(options);
    }
    runReport = vi.fn(async () => [{ rows: [] }]);
  },
}));

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

  it("throws when a row is missing its sessions metric value, instead of defaulting to 0", async () => {
    const runReport = vi.fn(async () => [
      { rows: [{ dimensionValues: [{ value: "Direct" }], metricValues: [] }] },
    ]);
    const runGa4Report = createGa4ReportRunner(
      { clientEmail: "sa@example.com", privateKey: "unused" },
      buildStubGa4Client(runReport as never),
    );

    await expect(
      runGa4Report({
        propertyId: "123456",
        dimension: "sessionDefaultChannelGrouping",
        startDate: "30daysAgo",
        endDate: "yesterday",
      }),
    ).rejects.toThrow(/missing a "sessions" metric value/);
  });

  it("reuses one real GA4 client across calls for the same credentials (module-level memoization)", () => {
    ga4ClientConstructor.mockClear();

    createGa4ReportRunner({
      clientEmail: "shared-sa@example.com",
      privateKey: "key-one",
    });
    createGa4ReportRunner({
      clientEmail: "shared-sa@example.com",
      privateKey: "key-one",
    });

    expect(ga4ClientConstructor).toHaveBeenCalledTimes(1);
  });
});
