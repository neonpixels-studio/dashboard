// Netlify Functions bundle separately from the Nitro server build and never
// load sentry.server.config.ts (see nuxt.config.ts's SENTRY_DSN bake-in
// comment). Without an explicit Sentry.init() call here, the reportError/
// reportErrorCondition calls scheduled-sync.ts makes via
// ../../server/utils/errorReporting would silently no-op in this runtime —
// the SDK never throws without a client, it just drops the event. Mirrors
// sentry.server.config.ts's init shape so both runtimes report to the same
// Sentry project consistently.
//
// SENTRY_DSN comes from .env.production, decrypted at runtime by loadEnv()
// (see ./env.ts), so it never needs to be duplicated in Netlify's own UI.
import * as Sentry from "@sentry/nuxt";
import { loadEnv } from "./env";

// Milliseconds flushSentry() waits for queued events to actually leave the
// process before giving up — see that function's comment for why this can't
// be skipped. Exported so tests assert against this constant rather than a
// second, independently-drifting copy of the literal.
export const FLUSH_TIMEOUT_MS = 2000;

let initialized = false;

export function initSentry(): void {
  if (initialized) {
    return;
  }
  loadEnv();
  // Sentry.init({ dsn: undefined }) does not throw — it just leaves the SDK
  // without a client, so every later captureException/captureMessage call
  // silently drops its event. Logged here so a SENTRY_DSN missing from
  // .env.production shows up as a visible symptom instead
  // of "Sentry has nothing" being indistinguishable from "nothing failed".
  if (!process.env.SENTRY_DSN) {
    // This module has one caller today (scheduled-sync.ts), but the message
    // stays generic rather than naming it — a second Netlify Function
    // reusing this helper would otherwise get a mislabeled log line.
    console.error(
      "netlify/functions/sentry.ts: SENTRY_DSN is not set; Sentry reporting is disabled for this invocation",
    );
  }
  try {
    // Monitoring must never break the real job: scheduledSync() calls this
    // ahead of its own try/finally (so init failures still reach it), so a
    // throw here — a malformed DSN, an SDK/bundling problem — would
    // otherwise skip both the sync itself and flushSentry(), which is
    // exactly the "never let reporting break the caller" rule captureSafely
    // enforces in server/utils/errorReporting.ts.
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    });
  } catch (initError) {
    console.error("Failed to initialize Sentry", initError);
  }
  initialized = true;
}

// Sentry.init() queues events and sends them over HTTP asynchronously — it
// does not await delivery. A Netlify Function's execution environment is
// frozen (or torn down) the instant its handler's promise settles, so any
// event captured moments earlier would otherwise never actually leave the
// process. Call this on every exit path of the handler (success or failure)
// after initSentry() has run.
//
// Never throws: this runs from a bare `finally` in the caller, so a rejected
// flush (a transport error, a client in a bad state) must not replace
// whatever error the handler was already failing with.
export async function flushSentry(): Promise<void> {
  try {
    // Resolves to `false` (rather than rejecting) on a timeout — that's
    // still a real drop of whatever was queued, so it's logged the same as
    // the throw path below, not silently ignored.
    const flushed = await Sentry.flush(FLUSH_TIMEOUT_MS);
    if (!flushed) {
      console.error(
        "Sentry flush timed out before the worker froze; queued events may have been dropped",
      );
    }
  } catch (flushError) {
    console.error("Failed to flush Sentry before the worker froze", flushError);
  }
}
