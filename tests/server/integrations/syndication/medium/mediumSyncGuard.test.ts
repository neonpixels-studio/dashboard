import { describe, expect, it } from "vitest";
import {
  MEDIUM_MIN_SYNC_INTERVAL_HOURS,
  isMediumSyncDue,
} from "../../../../../server/integrations/syndication/medium/mediumSyncGuard";

const HOUR_MS = 60 * 60 * 1000;

describe("isMediumSyncDue", () => {
  it("is due when no successful sync or attempt has ever happened", () => {
    expect(isMediumSyncDue(new Date("2026-09-20T12:00:00Z"), null, null)).toBe(
      true,
    );
  });

  it(`is NOT due before ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours have passed since the last success`, () => {
    const lastSuccessfulSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastSuccessfulSyncAt.getTime() +
        (MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS - 1),
    );

    expect(isMediumSyncDue(now, lastSuccessfulSyncAt, null)).toBe(false);
  });

  it(`is due at exactly ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours since the last success`, () => {
    const lastSuccessfulSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastSuccessfulSyncAt.getTime() + MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS,
    );

    expect(isMediumSyncDue(now, lastSuccessfulSyncAt, null)).toBe(true);
  });

  it(`is due well after ${MEDIUM_MIN_SYNC_INTERVAL_HOURS} hours since the last success`, () => {
    const lastSuccessfulSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date("2026-09-21T12:00:00Z");

    expect(isMediumSyncDue(now, lastSuccessfulSyncAt, null)).toBe(true);
  });

  it("is NOT due when a recent attempt failed, even with no prior success", () => {
    // Regression case for the retry-storm this watermark exists to prevent:
    // every sync has failed so far (lastSuccessfulSyncAt is null), but an
    // attempt was made 5 minutes ago — without lastAttemptedSyncAt gating
    // this too, the guard would say "due" on every 15-minute orchestrator
    // tick and burn the monthly request cap within hours.
    const lastAttemptedSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(lastAttemptedSyncAt.getTime() + 5 * 60 * 1000);

    expect(isMediumSyncDue(now, null, lastAttemptedSyncAt)).toBe(false);
  });

  it("gates on the attempt watermark when it is more recent than the success watermark", () => {
    const lastSuccessfulSyncAt = new Date("2026-08-01T00:00:00Z");
    const lastAttemptedSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastAttemptedSyncAt.getTime() +
        (MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS - 1),
    );

    expect(
      isMediumSyncDue(now, lastSuccessfulSyncAt, lastAttemptedSyncAt),
    ).toBe(false);
  });

  it("gates on the success watermark when it is more recent than the attempt watermark", () => {
    // e.g. a sync attempt long ago failed, then a later one succeeded.
    const lastAttemptedSyncAt = new Date("2026-08-01T00:00:00Z");
    const lastSuccessfulSyncAt = new Date("2026-09-20T12:00:00Z");
    const now = new Date(
      lastSuccessfulSyncAt.getTime() +
        (MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS - 1),
    );

    expect(
      isMediumSyncDue(now, lastSuccessfulSyncAt, lastAttemptedSyncAt),
    ).toBe(false);
  });

  it("is due once both watermarks are far enough in the past", () => {
    const lastSuccessfulSyncAt = new Date("2026-09-19T00:00:00Z");
    const lastAttemptedSyncAt = new Date("2026-09-19T06:00:00Z");
    const now = new Date(
      lastAttemptedSyncAt.getTime() + MEDIUM_MIN_SYNC_INTERVAL_HOURS * HOUR_MS,
    );

    expect(
      isMediumSyncDue(now, lastSuccessfulSyncAt, lastAttemptedSyncAt),
    ).toBe(true);
  });
});
