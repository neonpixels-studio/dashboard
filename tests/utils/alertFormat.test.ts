import { describe, expect, it } from "vitest";
import { formatAlertTime } from "../../app/utils/alertFormat";

describe("formatAlertTime", () => {
  it("formats an ISO timestamp as an absolute UTC date and time", () => {
    expect(formatAlertTime("2026-10-10T14:05:30.000Z")).toBe(
      "10 OCT 2026 · 14:05 UTC",
    );
  });

  it("returns null for null or unparseable input", () => {
    expect(formatAlertTime(null)).toBeNull();
    expect(formatAlertTime("not a date")).toBeNull();
  });
});
