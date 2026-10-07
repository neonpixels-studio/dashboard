// Sentry Cron check-ins for scheduled functions. The error reporting in
// ./sentry.ts only fires when an invocation runs and fails; if Netlify's
// scheduler stops invoking the function at all, nothing is reported. A
// monitor that expects a check-in every interval turns that silence into an
// alert. Kept behind this small wrapper so the SDK call is testable in
// isolation and a missing SENTRY_DSN is a no-op, matching initSentry().
import * as Sentry from "@sentry/nuxt";

export const SCHEDULED_SYNC_MONITOR_SLUG = "scheduled-sync";

// Mirrors `config.schedule` in ./scheduled-sync.ts, which can't import a
// shared constant (Netlify parses that literal from source). A test asserts
// the two stay equal.
export const SCHEDULED_SYNC_CRON = "*/15 * * * *";

// Minutes a check-in may arrive late before Sentry marks the run missed.
const CHECK_IN_MARGIN_MINUTES = 5;

// Minutes an in_progress check-in may stay open before Sentry marks it failed.
// Well above the function's own few-second execution ceiling.
const MAX_RUNTIME_MINUTES = 5;

const MONITOR_TIMEZONE = "Etc/UTC";

export const SCHEDULED_SYNC_MONITOR_CONFIG = {
  schedule: { type: "crontab", value: SCHEDULED_SYNC_CRON },
  checkinMargin: CHECK_IN_MARGIN_MINUTES,
  maxRuntime: MAX_RUNTIME_MINUTES,
  timezone: MONITOR_TIMEZONE,
} as const;

type CheckInStatus = "in_progress" | "ok" | "error";

// Monitoring must never break the real job, so SDK failures are logged and
// swallowed (same rule as initSentry/flushSentry).
function sendCheckIn(
  checkIn: { monitorSlug: string; status: CheckInStatus; checkInId?: string },
  includeMonitorConfig: boolean,
): string | undefined {
  if (!process.env.SENTRY_DSN) {
    return undefined;
  }
  try {
    return Sentry.captureCheckIn(
      checkIn,
      includeMonitorConfig ? SCHEDULED_SYNC_MONITOR_CONFIG : undefined,
    );
  } catch (checkInError) {
    console.error("Failed to send Sentry cron check-in", checkInError);
    return undefined;
  }
}

// Reports in_progress, runs the job, then reports ok (2xx response) or error
// (non-2xx response or a throw). A throw is rethrown unchanged. The monitor
// config rides on the in_progress check-in, which creates or updates the
// monitor (upsert), so no manual setup in the Sentry UI is needed.
export async function withScheduledSyncMonitor(
  job: () => Promise<Response>,
): Promise<Response> {
  const checkInId = sendCheckIn(
    { monitorSlug: SCHEDULED_SYNC_MONITOR_SLUG, status: "in_progress" },
    true,
  );
  let response: Response;
  try {
    response = await job();
  } catch (jobError) {
    sendCheckIn(
      { monitorSlug: SCHEDULED_SYNC_MONITOR_SLUG, status: "error", checkInId },
      false,
    );
    throw jobError;
  }
  sendCheckIn(
    {
      monitorSlug: SCHEDULED_SYNC_MONITOR_SLUG,
      status: response.ok ? "ok" : "error",
      checkInId,
    },
    false,
  );
  return response;
}
