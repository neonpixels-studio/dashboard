import { describe, expect, it } from "vitest";
import {
  assertNonNegativeCount,
  computeNewUsersWindowStart,
  countActiveSince,
  countBySignInMethod,
  countDailySignups,
  countVerifiedEmailUsers,
  isCompleteScan,
} from "../../../../server/integrations/clerk/mapping";
import type { ClerkUserSummary } from "../../../../server/integrations/clerk/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function user(overrides: Partial<ClerkUserSummary> = {}): ClerkUserSummary {
  return {
    createdAt: Date.UTC(2026, 8, 1),
    lastActiveAt: null,
    hasVerifiedEmail: true,
    signInMethod: "github",
    ...overrides,
  };
}

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

  it("throws on a missing count instead of silently passing it through (SDK shape drift, e.g. a totalCount field that stopped being returned)", () => {
    expect(() =>
      assertNonNegativeCount(undefined as unknown as number, "new users"),
    ).toThrow(/must be a non-negative integer, got undefined/);
  });
});

describe("isCompleteScan", () => {
  it("is true only when every counted user was scanned", () => {
    const scan = { users: [user(), user()], totalCount: 2, consistent: true };

    expect(isCompleteScan(scan)).toBe(true);
    expect(isCompleteScan({ ...scan, users: [user()] })).toBe(false);
    expect(isCompleteScan({ ...scan, consistent: false })).toBe(false);
  });
});

describe("countVerifiedEmailUsers", () => {
  it("counts only users with a verified email", () => {
    expect(
      countVerifiedEmailUsers([
        user(),
        user({ hasVerifiedEmail: false }),
        user(),
      ]),
    ).toBe(2);
  });
});

describe("countActiveSince", () => {
  it("counts users active at or after the cutoff and ignores never-active users", () => {
    const since = Date.UTC(2026, 8, 13);

    expect(
      countActiveSince(
        [
          user({ lastActiveAt: since }),
          user({ lastActiveAt: since - 1 }),
          user({ lastActiveAt: null }),
        ],
        since,
      ),
    ).toBe(1);
  });
});

describe("countBySignInMethod", () => {
  it("counts each user once under their single classified method", () => {
    const counts = countBySignInMethod([
      user({ signInMethod: "github" }),
      user({ signInMethod: "github" }),
      user({ signInMethod: "password" }),
    ]);

    expect(Object.fromEntries(counts)).toEqual({ github: 2, password: 1 });
  });
});

describe("countDailySignups", () => {
  const now = new Date("2026-09-20T15:30:00.000Z");

  it("returns one oldest-first entry per UTC day ending today, zero-filling empty days", () => {
    const result = countDailySignups(
      [
        user({ createdAt: Date.UTC(2026, 8, 20, 1) }),
        user({ createdAt: Date.UTC(2026, 8, 20, 23) }),
        user({ createdAt: Date.UTC(2026, 8, 18) }),
      ],
      now,
      3,
    );

    expect(
      result.map(({ dayStart, count }) => [dayStart.toISOString(), count]),
    ).toEqual([
      ["2026-09-18T00:00:00.000Z", 1],
      ["2026-09-19T00:00:00.000Z", 0],
      ["2026-09-20T00:00:00.000Z", 2],
    ]);
  });

  it("ignores users created before the window", () => {
    const result = countDailySignups(
      [user({ createdAt: now.getTime() - 40 * DAY_MS })],
      now,
      30,
    );

    expect(result).toHaveLength(30);
    expect(result.every(({ count }) => count === 0)).toBe(true);
  });
});
