import { describe, expect, it } from "vitest";
import {
  assertNonNegativeCount,
  computeNewUsersWindowStart,
} from "../../../../server/integrations/clerk/mapping";

describe("computeNewUsersWindowStart", () => {
  it("returns the epoch ms exactly windowDays before now", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");

    const windowStart = computeNewUsersWindowStart(now, 30);

    expect(new Date(windowStart).toISOString()).toBe(
      "2026-08-21T12:00:00.000Z",
    );
  });

  it("returns now itself for a zero-day window", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");

    expect(computeNewUsersWindowStart(now, 0)).toBe(now.getTime());
  });
});

describe("assertNonNegativeCount", () => {
  it("returns the count unchanged when it's a non-negative integer", () => {
    expect(assertNonNegativeCount(842, "total users")).toBe(842);
    expect(assertNonNegativeCount(0, "new users")).toBe(0);
  });

  it("throws on a negative count instead of silently reporting it", () => {
    expect(() => assertNonNegativeCount(-1, "total users")).toThrow(
      /total users count must be a non-negative integer, got -1/,
    );
  });

  it("throws on a non-integer count", () => {
    expect(() => assertNonNegativeCount(4.5, "new users")).toThrow(
      /new users count must be a non-negative integer, got 4.5/,
    );
  });

  it("throws on NaN", () => {
    expect(() => assertNonNegativeCount(NaN, "total users")).toThrow(
      /must be a non-negative integer/,
    );
  });
});
