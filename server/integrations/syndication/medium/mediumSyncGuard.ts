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
// that cadence independent of how often the orchestrator itself runs (every
// 15 minutes — see netlify/functions/scheduled-sync.ts).
export const MEDIUM_MIN_SYNC_INTERVAL_HOURS = 24;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
// Exported (not just used internally by isMediumSyncDue below) so
// provider.ts's atomic attempt-claim — recordSyncAttempt in persist.ts —
// can enforce the exact same cadence at the DB layer, closing the
// check-then-act gap a JS-only isMediumSyncDue call leaves between reading
// the watermarks and claiming the attempt. See provider.ts's
// defaultRecordAttempt.
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
 * 15-minute orchestrator tick: `lastSuccessfulSyncAt` only advances on a fully
 * successful sync (see provider.ts's buildSyndicationResult call), so without
 * this second watermark a failing attempt would never push the clock forward
 * and would burn real requests against the monthly cap on every tick forever.
 * `lastAttemptedSyncAt` instead advances the moment a real network attempt
 * starts, independent of whether it goes on to succeed or throw — see
 * provider.ts's recordAttempt call, made before fetchMediumSyndication runs.
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
