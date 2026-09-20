import { describe, expect, it } from "vitest";
import {
  CHANNEL_BUCKET_DIRECT,
  CHANNEL_BUCKET_ORGANIC,
  CHANNEL_BUCKET_OTHER,
  CHANNEL_BUCKET_REFERRAL,
  parseGa4Date,
  parseGa4MetricValue,
  sumReportSessions,
  sumSessions,
  toChannelBreakdown,
  toChannelBucket,
  toDailySessionPoints,
} from "../../../../server/integrations/ga4/mapping";
import type { Ga4ReportRow } from "../../../../server/integrations/ga4/types";

describe("parseGa4Date", () => {
  it("parses a YYYYMMDD dimension value into a UTC midnight Date", () => {
    const date = parseGa4Date("20260919");

    expect(date.toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("throws on a value that isn't YYYYMMDD", () => {
    expect(() => parseGa4Date("2026-09-19")).toThrow(/YYYYMMDD/);
  });

  it("throws on an out-of-range month/day instead of silently rolling over", () => {
    // Date.UTC alone would roll "20261301" into 2027-01-01 and "20260931"
    // into 2026-10-01 — both must be rejected, not silently re-dated.
    expect(() => parseGa4Date("20261301")).toThrow(/not a real calendar date/);
    expect(() => parseGa4Date("20260931")).toThrow(/not a real calendar date/);
  });
});

describe("parseGa4MetricValue", () => {
  it("parses a numeric string", () => {
    expect(parseGa4MetricValue("142")).toBe(142);
  });

  it("throws on a non-numeric value instead of silently returning 0", () => {
    expect(() => parseGa4MetricValue("not-a-number")).toThrow(/finite number/);
  });
});

describe("toDailySessionPoints", () => {
  it("maps rows to sorted daily session points, oldest first", () => {
    const rows: Ga4ReportRow[] = [
      { dimensionValue: "20260920", metricValue: "50" },
      { dimensionValue: "20260918", metricValue: "30" },
      { dimensionValue: "20260919", metricValue: "40" },
    ];

    const points = toDailySessionPoints(rows);

    expect(points.map((point) => point.sessions)).toEqual([30, 40, 50]);
    expect(points[0].date.toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("returns an empty list for an empty report (no fabricated zero days)", () => {
    expect(toDailySessionPoints([])).toEqual([]);
  });
});

describe("sumSessions", () => {
  it("sums the sessions across every point", () => {
    expect(
      sumSessions([{ sessions: 10 }, { sessions: 5 }, { sessions: 0 }]),
    ).toBe(15);
  });

  it("returns 0 for an empty list", () => {
    expect(sumSessions([])).toBe(0);
  });
});

describe("sumReportSessions", () => {
  it("sums the sessions metric across a report's rows regardless of dimension", () => {
    const rows: Ga4ReportRow[] = [
      { dimensionValue: "Organic Search", metricValue: "600" },
      { dimensionValue: "Direct", metricValue: "300" },
    ];

    expect(sumReportSessions(rows)).toBe(900);
  });

  it("returns 0 for an empty report", () => {
    expect(sumReportSessions([])).toBe(0);
  });
});

describe("toChannelBucket", () => {
  it.each([
    ["Direct", CHANNEL_BUCKET_DIRECT],
    ["Organic Search", CHANNEL_BUCKET_ORGANIC],
    ["Organic Shopping", CHANNEL_BUCKET_ORGANIC],
    ["Referral", CHANNEL_BUCKET_REFERRAL],
    ["Organic Social", CHANNEL_BUCKET_REFERRAL],
    ["Paid Social", CHANNEL_BUCKET_REFERRAL],
  ])("maps GA4 grouping %s to bucket %s", (grouping, bucket) => {
    expect(toChannelBucket(grouping)).toBe(bucket);
  });

  it("falls back to 'other' for an unrecognized grouping instead of dropping it", () => {
    expect(toChannelBucket("Paid Search")).toBe(CHANNEL_BUCKET_OTHER);
    expect(toChannelBucket("Unassigned")).toBe(CHANNEL_BUCKET_OTHER);
  });
});

describe("toChannelBreakdown", () => {
  it("aggregates rows into bucketed percentages of the given total", () => {
    const rows: Ga4ReportRow[] = [
      { dimensionValue: "Organic Search", metricValue: "600" },
      { dimensionValue: "Direct", metricValue: "300" },
      { dimensionValue: "Referral", metricValue: "100" },
    ];

    const breakdown = toChannelBreakdown(rows, 1000);

    expect(breakdown).toEqual(
      expect.arrayContaining([
        { channel: CHANNEL_BUCKET_ORGANIC, pct: 60 },
        { channel: CHANNEL_BUCKET_DIRECT, pct: 30 },
        { channel: CHANNEL_BUCKET_REFERRAL, pct: 10 },
      ]),
    );
    expect(breakdown).toHaveLength(3);
  });

  it("merges multiple GA4 groupings that map to the same bucket", () => {
    const rows: Ga4ReportRow[] = [
      { dimensionValue: "Referral", metricValue: "50" },
      { dimensionValue: "Organic Social", metricValue: "30" },
      { dimensionValue: "Paid Social", metricValue: "20" },
    ];

    const breakdown = toChannelBreakdown(rows, 100);

    expect(breakdown).toEqual([{ channel: CHANNEL_BUCKET_REFERRAL, pct: 100 }]);
  });

  it("rounds percentages to 2 decimal places", () => {
    const rows: Ga4ReportRow[] = [
      { dimensionValue: "Direct", metricValue: "1" },
    ];

    const breakdown = toChannelBreakdown(rows, 3);

    expect(breakdown).toEqual([{ channel: CHANNEL_BUCKET_DIRECT, pct: 33.33 }]);
  });

  it("throws instead of dividing by zero when totalSessions is not positive", () => {
    const rows: Ga4ReportRow[] = [
      { dimensionValue: "Direct", metricValue: "0" },
    ];

    expect(() => toChannelBreakdown(rows, 0)).toThrow(/positive totalSessions/);
    expect(() => toChannelBreakdown(rows, -5)).toThrow(
      /positive totalSessions/,
    );
  });
});
