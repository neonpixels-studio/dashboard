import type { ClerkUserScan, ClerkUserSummary } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Epoch ms marking the start of the new-users reporting window:
 * `windowDays` days before `now`. Takes `now` as a parameter (rather than
 * reading `Date.now()` itself) so provider.ts's `capturedAt` and this
 * window start are always derived from the exact same instant, instead of
 * two separate clock reads that could straddle a millisecond boundary.
 */
export function computeNewUsersWindowStart(
  now: Date,
  windowDays: number,
): number {
  return now.getTime() - windowDays * MS_PER_DAY;
}

/**
 * Clerk's own count endpoints only ever return non-negative integers by
 * contract, but a broken fixture, stub, or future SDK change could hand
 * this provider something else — failing loud here means a bogus users
 * count surfaces as a thrown error at sync time, not a silently wrong
 * number on the dashboard. Mirrors
 * server/integrations/ga4/mapping.ts's parseGa4MetricValue.
 */
export function assertNonNegativeCount(count: number, label: string): number {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(
      `Clerk ${label} count must be a non-negative integer, got ${count}.`,
    );
  }
  return count;
}

/**
 * A scan is only trustworthy when it saw every user Clerk counts. Anything
 * else (page cap hit, users added or removed mid-scan) yields no scan-derived metrics:
 * an omitted number is honest, a number extrapolated from a partial sample
 * is not.
 */
export function isCompleteScan(scan: ClerkUserScan): boolean {
  return scan.consistent && scan.users.length === scan.totalCount;
}

export function countVerifiedEmailUsers(users: ClerkUserSummary[]): number {
  return users.filter((user) => user.hasVerifiedEmail).length;
}

export function countActiveSince(
  users: ClerkUserSummary[],
  sinceMs: number,
): number {
  return users.filter(
    (user) => user.lastActiveAt !== null && user.lastActiveAt >= sinceMs,
  ).length;
}

export function countBySignInMethod(
  users: ClerkUserSummary[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const user of users) {
    counts.set(user.signInMethod, (counts.get(user.signInMethod) ?? 0) + 1);
  }
  return counts;
}

export interface DailySignupCount {
  dayStart: Date;
  count: number;
}

function startOfUtcDay(timestampMs: number): number {
  return Math.floor(timestampMs / MS_PER_DAY) * MS_PER_DAY;
}

/**
 * One entry per UTC calendar day for the `days` days ending with the day
 * containing `now` (oldest first). Days with no signups are real zeros —
 * only reachable from a complete scan — so they're included.
 */
export function countDailySignups(
  users: ClerkUserSummary[],
  now: Date,
  days: number,
): DailySignupCount[] {
  const todayStart = startOfUtcDay(now.getTime());
  const countsByDay = new Map<number, number>();
  for (const user of users) {
    const dayStart = startOfUtcDay(user.createdAt);
    countsByDay.set(dayStart, (countsByDay.get(dayStart) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_unused, index) => {
    const dayStart = todayStart - (days - 1 - index) * MS_PER_DAY;
    return {
      dayStart: new Date(dayStart),
      count: countsByDay.get(dayStart) ?? 0,
    };
  });
}
