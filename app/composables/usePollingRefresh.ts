import { getCurrentScope, onScopeDispose } from "vue";

// The scheduled sync runs hourly (netlify/functions/scheduled-sync.ts), so
// polling at a third of that picks up new data within ~20 minutes of a sync.
// Each poll wakes the Neon database, so polling faster than the sync just
// burns compute.
export const DATA_REFRESH_INTERVAL_MS = 20 * 60 * 1000;

// Re-runs `refresh` on an interval. Ticks that land while the tab is hidden
// are skipped; when the tab becomes visible again it refreshes once, unless a
// refresh already ran within the last interval. Cleans up with the calling
// scope; no-op during SSR.
export function usePollingRefresh(
  refresh: () => Promise<unknown> | unknown,
  intervalMs: number = DATA_REFRESH_INTERVAL_MS,
) {
  if (typeof document === "undefined") {
    return;
  }

  let inFlight = false;
  let lastRefreshedAt = Date.now();

  const refreshOnce = async () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    lastRefreshedAt = Date.now();
    try {
      await refresh();
    } catch {
      // The caller's `error` ref already exposes the failure; the next tick retries.
    } finally {
      inFlight = false;
    }
  };

  const handleTick = () => {
    if (document.hidden) {
      return;
    }
    void refreshOnce();
  };

  const handleVisibilityChange = () => {
    if (document.hidden || Date.now() - lastRefreshedAt < intervalMs) {
      return;
    }
    void refreshOnce();
  };

  const timer = setInterval(handleTick, intervalMs);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  }
}
