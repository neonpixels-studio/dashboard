import { describe, expect, it } from "vitest";
import {
  MEDIUM_MIN_SYNC_INTERVAL_HOURS,
  isMediumSyncDue,
} from "../../../../../server/integrations/syndication/medium/mediumSyncGuard";

const HOUR_MS = 60 * 60 * 1000;

describe("isMediumSyncDue", () => {
  it("is due when no successful sync has ever happened", () => {
    expect(isMediumSyncDue(new Date("2026-09-20T12:00:00Z"), null)).toBe(true);
  });

  it(`is NOT due before ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours have passed`, () => {
    const lastSuccessfulSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastSuccessfulSyncAt.getTime() +
        (MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS - 1),
    );

    expect(isMediumSyncDue(now, lastSuccessfulSyncAt)).toBe(false);
  });

  it(`is due at exactly ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours`, () => {
    const lastSuccessfulSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastSuccessfulSyncAt.getTime() + MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS,
    );

    expect(isMediumSyncDue(now, lastSuccessfulSyncAt)).toBe(true);
  });

  it(`is due well after ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours`, () => {
    const lastSuccessfulSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date("2026-09-21T12:00:00Z");

    expect(isMediumSyncDue(now, lastSuccessfulSyncAt)).toBe(true);
  });
});
