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

/**
 * True when enough time has passed since the last successful Medium sync to
 * run another one (or none has ever succeeded). Pure and clock-injected —
 * unit tests exercise it with fixed `now`/`lastSuccessfulSyncAt` values
 * rather than real timers.
 */
export function isMediumSyncDue(
  now: Date,
  lastSuccessfulSyncAt: Date | null,
): boolean {
  if (!lastSuccessfulSyncAt) {
    return true;
  }
  const elapsedMs = now.getTime() - lastSuccessfulSyncAt.getTime();
  return elapsedMs >= MEDIUM_MIN_SYNC_INTERVAL_HOURS * MILLISECONDS_PER_HOUR;
}
