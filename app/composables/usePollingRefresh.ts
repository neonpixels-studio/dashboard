import { getCurrentScope, onScopeDispose } from "vue";

// The scheduled sync runs every 15 minutes (netlify/functions/scheduled-sync.ts),
// so polling at a third of that picks up new data within ~5 minutes of a sync.
export const DATA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Re-runs `refresh` on an interval while the tab is visible. A hidden tab
// stops polling and refreshes once as soon as it becomes visible again.
// Cleans up with the calling scope; no-op during SSR.
export function usePollingRefresh(
  refresh: () => Promise<unknown> | unknown,
  intervalMs: number = DATA_REFRESH_INTERVAL_MS,
) {
  if (typeof document === "undefined") {
    return;
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight = false;

  const refreshOnce = async () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      await refresh();
    } catch {
      // The caller's `error` ref already exposes the failure; the next tick retries.
    } finally {
      inFlight = false;
    }
  };

  const start = () => {
    if (timer === undefined) {
      timer = setInterval(refreshOnce, intervalMs);
    }
  };

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stop();
      return;
    }
    void refreshOnce();
    start();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (!document.hidden) {
    start();
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  }
}
