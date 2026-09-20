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
