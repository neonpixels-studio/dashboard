import { describe, expect, it } from "vitest";
import { SERIES_WINDOW_DAYS } from "../../server/utils/dashboardQueries";
import {
  DEFAULT_OVERVIEW_RANGE,
  OVERVIEW_RANGE_OPTIONS,
  parseOverviewRange,
} from "../../shared/constants/overviewRange";

describe("parseOverviewRange", () => {
  it("offers exactly 7, 30 and 60 days, defaulting to 30", () => {
    expect([...OVERVIEW_RANGE_OPTIONS]).toEqual([7, 30, 60]);
    expect(DEFAULT_OVERVIEW_RANGE).toBe(30);
  });

  it("never offers a range wider than the series query reads", () => {
    expect(Math.max(...OVERVIEW_RANGE_OPTIONS)).toBeLessThanOrEqual(
      SERIES_WINDOW_DAYS,
    );
  });

  it.each([
    ["7", 7],
    ["30", 30],
    ["60", 60],
  ])("accepts %s", (raw, expected) => {
    expect(parseOverviewRange(raw)).toBe(expected);
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["unlisted number", "90"],
    ["zero", "0"],
    ["negative", "-7"],
    ["leading zero", "07"],
    ["decimal", "7.0"],
    ["trailing junk", "7abc"],
    ["scientific", "6e1"],
    ["a number type, not a string", 7],
    ["repeated param array", ["7", "60"]],
    ["null", null],
  ])("falls back to 30 for %s", (_label, raw) => {
    expect(parseOverviewRange(raw)).toBe(30);
  });
});
