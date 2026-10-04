import * as Sentry from "@sentry/nuxt";

// Sentry groups events by exception type + stack trace (or, for
// captureMessage, by the message text), not by tags — a tag alone would not
// stop two unrelated call sites that happen to raise the same underlying
// error (e.g. a fetch timeout surfacing from both "scheduled-sync: POST
// /api/sync request failed to complete" and some future call site) from
// collapsing into a single Sentry issue. The `reportSite` tag is for
// filtering/searching in the Sentry UI once an issue is found; the
// fingerprint is what actually keeps distinct call sites as distinct issues.
// Shared by reportError and reportErrorCondition so both tag and fingerprint
// identically — this must not silently exist on only one of the two entry
// points.
function sentryCaptureContext(
  message: string,
  context: Record<string, unknown> | undefined,
  fingerprintExtra: string[] = [],
): {
  tags: { reportSite: string };
  fingerprint: string[];
  extra: Record<string, unknown> | undefined;
} {
  return {
    tags: { reportSite: message },
    fingerprint: ["{{ default }}", message, ...fingerprintExtra],
    extra: context,
  };
}

// This is a monitoring side effect, not the thing the caller actually cares
// about — every call site here exists specifically so a reporting/logging
// failure can never turn a handled or best-effort error into an unhandled
// one. A throw from the Sentry SDK itself (a scope/serialization failure, a
// not-fully-initialized client) must not escape reportError/
// reportErrorCondition and start rejecting promises inside `.catch()`
// handlers that were written assuming they cannot fail.
function captureSafely(capture: () => void): void {
  try {
    capture();
  } catch (reportingError) {
    console.error(
      "[errorReporting] failed to report to Sentry",
      reportingError,
    );
  }
}

// The one place server code (including the standalone Netlify Functions in
// netlify/functions/, which never load sentry.server.config.ts — see
// netlify/functions/sentry.ts) talks to Sentry, so every call site stays
// testable in isolation (mock this module, or `@sentry/nuxt` directly)
// rather than reaching into the SDK itself, and so an unexpected error keeps
// its existing console.error signal while also becoming visible in
// production monitoring — which a bare console.error never provided.
//
// `message` must be a static string (no interpolated ids/details) — it
// becomes both the `reportSite` tag value and part of the fingerprint, so a
// per-call-site string that varies per invocation (e.g. embedding a userId)
// would fragment one call site into one Sentry group/tag value per value
// instead of keeping it as a single, filterable issue. Put anything that
// varies in `context` instead.
//
// `context` is forwarded as Sentry "extra" data, so the same detail already
// being logged (ids, delivery info, etc.) shows up on the captured event too.
export function reportError(
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(message, error);

  captureSafely(() => {
    Sentry.captureException(error, sentryCaptureContext(message, context));
  });
}

// For error-level conditions that never had a thrown/caught exception to
// begin with (e.g. scheduled-sync.ts's "every attempted integration failed
// this run" — a logical condition, not a caught error) — reportError would
// otherwise be called with a context object standing in for `error`, losing
// both the exception (there isn't one) and the context (it landed in the
// wrong parameter).
//
// `fingerprintExtra` splits one static message into separate Sentry issues
// per value (e.g. per slug/vendor), so a second affected entity still opens
// its own issue and notifies while the first is unresolved.
export function reportErrorCondition(
  message: string,
  context?: Record<string, unknown>,
  fingerprintExtra?: string[],
): void {
  if (context) {
    console.error(message, context);
  } else {
    console.error(message);
  }

  captureSafely(() => {
    Sentry.captureMessage(message, {
      level: "error",
      ...sentryCaptureContext(message, context, fingerprintExtra),
    });
  });
}
