import { describe, expect, it } from "vitest";
import {
  MEDIUM_MIN_SYNC_INTERVAL_HOURS,
  isMediumSyncDue,
} from "../../../../../server/integrations/syndication/medium/mediumSyncGuard";

const HOUR_MS = 60 * 60 * 1000;

describe("isMediumSyncDue", () => {
  it("is due when no sync has ever been attempted", () => {
    expect(isMediumSyncDue(new Date("2026-09-20T12:00:00Z"), null)).toBe(true);
  });

  it(`is NOT due before ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours have passed since the last attempt`, () => {
    const lastAttemptAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastAttemptAt.getTime() + (MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS - 1),
    );

    expect(isMediumSyncDue(now, lastAttemptAt)).toBe(false);
  });

  it(`is due at exactly ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours`, () => {
    const lastAttemptAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastAttemptAt.getTime() + MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS,
    );

    expect(isMediumSyncDue(now, lastAttemptAt)).toBe(true);
  });

  it(`is due well after ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours`, () => {
    const lastAttemptAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date("2026-09-21T12:00:00Z");

    expect(isMediumSyncDue(now, lastAttemptAt)).toBe(true);
  });

  it("is NOT due again immediately after a failed attempt (only elapsed time matters, not outcome)", () => {
    // isMediumSyncDue itself has no notion of success/failure — this pins
    // down that its ONLY input besides `now` is a timestamp, matching
    // provider.ts's use of sync_status.last_run_at (set on every attempt,
    // not just successful ones) as that timestamp.
    const lastAttemptAt = new Date("2026-09-20T11:59:00Z"); // 1 minute ago
    const now = new Date("2026-09-20T12:00:00Z");

    expect(isMediumSyncDue(now, lastAttemptAt)).toBe(false);
  });
});
