// mediumapi.com's shared plan enforces a hard 150-request cap per month (see
// the issue this provider implements) — a single sync already costs 2
// requests for the article-id list plus up to
// MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC more for per-article detail (see
// provider.ts), so syncing on every orchestrator tick (every 15 minutes —
// see netlify/functions/scheduled-sync.ts) would exhaust the whole month's
// budget in hours. Gating on a minimum interval since the last *successful*
// Medium sync (see server/utils/dashboardQueries.ts's
// fetchLatestMetricCapturedAt for why success, not "last run", is the right
// clock here) keeps this provider to at most 3 syncs/day (24h / 8h),
// independent of how often the orchestrator itself runs.
export const MEDIUM_MIN_SYNC_INTERVAL_HOURS = 8;
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
