import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReportErrorCondition = vi.fn();
const mockReportError = vi.fn();
vi.mock("../../../server/utils/errorReporting", () => ({
  reportErrorCondition: mockReportErrorCondition,
  reportError: mockReportError,
}));

const {
  alertOnStaleVendors,
  findStaleVendors,
  STALE_VENDOR_MESSAGE,
  STALE_VENDOR_THRESHOLD_MS,
} = await import("../../../server/integrations/staleVendorAlert");

const NOW = new Date("2026-10-04T12:00:00Z");
const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 60 * 60 * 1_000);

function row(
  vendor: string,
  lastSuccessAt: Date | null,
  lastRunAt: Date | null = NOW,
) {
  return { slug: "basin", vendor, lastRunAt, lastSuccessAt };
}

describe("findStaleVendors", () => {
  it("flags only rows whose last success is older than the threshold", () => {
    const stale = findStaleVendors(
      [row("stripe", hoursAgo(7)), row("ga4", hoursAgo(1))],
      NOW,
    );
    expect(stale.map((vendor) => vendor.vendor)).toEqual(["stripe"]);
    expect(stale[0]).toMatchObject({ slug: "basin", hoursSinceSuccess: 7 });
  });

  it("does not flag a row exactly at the threshold", () => {
    const atThreshold = new Date(NOW.getTime() - STALE_VENDOR_THRESHOLD_MS);
    expect(findStaleVendors([row("stripe", atThreshold)], NOW)).toEqual([]);
  });

  it("flags a row that has run but never succeeded", () => {
    expect(findStaleVendors([row("stripe", null)], NOW)).toEqual([
      expect.objectContaining({
        vendor: "stripe",
        lastSuccessAt: null,
        hoursSinceSuccess: null,
      }),
    ]);
  });

  it("ignores a row with no recorded run or success", () => {
    expect(findStaleVendors([row("medium", null, null)], NOW)).toEqual([]);
  });
});

describe("alertOnStaleVendors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports each stale vendor once, with static message and context", async () => {
    const stale = await alertOnStaleVendors({
      listSyncHealthRows: async () => [
        row("stripe", hoursAgo(30)),
        row("clerk", hoursAgo(8)),
        row("ga4", hoursAgo(0)),
      ],
      now: () => NOW,
    });

    expect(stale).toHaveLength(2);
    expect(mockReportErrorCondition).toHaveBeenCalledTimes(2);
    expect(mockReportErrorCondition).toHaveBeenCalledWith(
      STALE_VENDOR_MESSAGE,
      expect.objectContaining({
        slug: "basin",
        vendor: "stripe",
        hoursSinceSuccess: 30,
      }),
    );
  });

  it("reports nothing when every vendor is fresh", async () => {
    await alertOnStaleVendors({
      listSyncHealthRows: async () => [row("stripe", hoursAgo(1))],
      now: () => NOW,
    });
    expect(mockReportErrorCondition).not.toHaveBeenCalled();
  });

  it("reports and swallows a query failure instead of throwing", async () => {
    const failure = new Error("db down");
    const stale = await alertOnStaleVendors({
      listSyncHealthRows: async () => {
        throw failure;
      },
    });
    expect(stale).toEqual([]);
    expect(mockReportError).toHaveBeenCalledWith(
      "sync: stale vendor check failed",
      failure,
    );
    expect(mockReportErrorCondition).not.toHaveBeenCalled();
  });
});
