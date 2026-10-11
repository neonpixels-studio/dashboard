// mediumapi.com's shared plan enforces a hard 150-request cap per month (see
// the issue this provider implements). The interval below is derived from
// that cap, not just from the issue's "no more than 3 times a day" framing —
// 3/day (8h) sounds safe on its own, but at up to
// MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC + 2 requests per sync (provider.ts),
// 3/day would cost up to 90 * 17 = 1,530 requests/month, ~10x the cap. Once
// a day (30 syncs/month) at MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC=2 costs at
// most 30 * 4 = 120 requests/month, leaving headroom for a 31-day month and
// any manually-triggered POST /api/sync calls outside the schedule. Gating
// on a minimum interval since the last *successful* Medium sync (see
// server/utils/dashboardQueries.ts's fetchLatestMetricCapturedAt for why
// success, not "last run", is the right clock here) keeps this provider on
// that cadence independent of how often the orchestrator itself runs (hourly;
// see netlify/functions/scheduled-sync.ts).
export const MEDIUM_MIN_SYNC_INTERVAL_HOURS = 24;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
// Exported so provider.ts's atomic attempt-claim (recordSyncAttempt in
// persist.ts) can enforce this same cadence at the DB layer — see that
// function's comment for why.
export const MEDIUM_MIN_SYNC_INTERVAL_MS =
  MEDIUM_MIN_SYNC_INTERVAL_HOURS * MILLISECONDS_PER_HOUR;

// Later of two possibly-null watermarks; null only when both are.
function laterOf(first: Date | null, second: Date | null): Date | null {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return first.getTime() >= second.getTime() ? first : second;
}

/**
 * True when enough time has passed since the last successful Medium sync — or
 * the last Medium sync *attempt*, whichever is more recent — to run another
 * one (or neither has ever happened).
 *
 * `lastAttemptedSyncAt` is what keeps a persistently-failing sync (bad key, a
 * mapping bug, a transient mediumapi.com outage) from retrying on every
 * hourly orchestrator tick, since `lastSuccessfulSyncAt` alone only
 * advances on a full success (provider.ts's buildSyndicationResult) and would
 * otherwise never push the clock forward. It instead advances the moment a
 * real network attempt starts, independent of whether it goes on to succeed
 * or throw — see provider.ts's recordAttempt call. Trade-off: after fixing a
 * revoked key, the next sync (scheduled or a manual POST /api/sync) still
 * waits out the same interval from that last failed attempt — to force an
 * immediate retry, clear the watermark by hand:
 * `UPDATE sync_status SET last_attempted_at = NULL WHERE vendor = 'medium'`.
 *
 * Pure and clock-injected — unit tests exercise it with fixed
 * `now`/`lastSuccessfulSyncAt`/`lastAttemptedSyncAt` values rather than real
 * timers.
 */
export function isMediumSyncDue(
  now: Date,
  lastSuccessfulSyncAt: Date | null,
  lastAttemptedSyncAt: Date | null,
): boolean {
  const lastGateAt = laterOf(lastSuccessfulSyncAt, lastAttemptedSyncAt);
  if (!lastGateAt) {
    return true;
  }
  const elapsedMs = now.getTime() - lastGateAt.getTime();
  return elapsedMs >= MEDIUM_MIN_SYNC_INTERVAL_MS;
}
