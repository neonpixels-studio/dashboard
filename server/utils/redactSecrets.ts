// Scrubs secret material a vendor SDK error can echo back before that error
// is ever persisted to `sync_status.error` or returned to a sync caller
// (see server/integrations/orchestrator.ts's syncOneIntegration, the one
// write/return site this guards). Grounded in the actual secret shapes this
// app resolves (server/integrations/config.ts's resolveSecret,
// server/utils/integrationSecrets.ts): Stripe/Clerk-style
// `sk_live_`/`sk_test_` API keys, a GA4 service account's PEM private key
// (including a truncated one — vendor errors and `util.inspect` routinely
// cut long strings short), bearer tokens and `x-api-key` headers a vendor
// client might dump into an error message (plain or JSON-serialized), and
// credential query params (`?api_key=`, `?key=`, `?token=`) some vendors
// echo back in a failed request's URL.
//
// Two layers: a pattern deny-list below (a backstop for known secret
// *shapes*), plus an optional exact-match pass in redactSecrets() for the
// one secret *value* the caller already resolved for this row — a Sentry
// auth token or similar opaque credential matches none of these shapes, but
// the orchestrator already has its literal value in hand.

const REDACTED = "[REDACTED]";

const STRIPE_STYLE_API_KEY_PATTERN = /\b[sr]k_(?:live|test)_[A-Za-z0-9]+/g;

// Paired BEGIN/END form first (see REDACTION_STEPS ordering) — matches a
// complete PEM block without also swallowing unrelated trailing text.
const SERVICE_ACCOUNT_PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

// Fallback for a truncated key that never reaches its own END marker (a
// message-length cap cut it off) — matches from BEGIN to the end of the
// message. Applied after the paired pattern above, so a well-formed PEM
// block is already gone by the time this one would otherwise match too much
// of the surrounding message.
const UNTERMINATED_PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g;

// Matches a bearer token whether the header reads as plain text
// ("Authorization: Bearer abc123") or as a JSON-serialized request/headers
// object some SDKs stringify into their error message
// ('"authorization":"Bearer abc123"'); optional quotes and `=` (alongside
// `:`) cover both. The value stops at the next quote/comma/brace/whitespace
// so it doesn't also eat the rest of a JSON blob.
const AUTHORIZATION_BEARER_HEADER_PATTERN =
  /(["']?authorization["']?\s*[:=]\s*["']?bearer\s+)[^"'\s,}]+/gi;

// Same plain-vs-JSON reasoning as the bearer pattern above, for the
// `x-api-key` header some vendors use instead of `Authorization`.
const API_KEY_HEADER_PATTERN =
  /(["']?x-api-key["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi;

const CREDENTIAL_QUERY_PARAM_PATTERN =
  /([?&](?:api_key|apikey|api-key|key|token|access_token|secret)=)[^&\s"'<>]+/gi;

// One entry per secret shape, in the order they must run (paired PEM before
// its unterminated fallback). `replacement` keeps the header's own key name
// via `$1` where the pattern captured one; the two API-key-shaped patterns
// wholesale-replace their match since it's all secret material.
const REDACTION_STEPS: { pattern: RegExp; replacement: string }[] = [
  { pattern: STRIPE_STYLE_API_KEY_PATTERN, replacement: REDACTED },
  { pattern: SERVICE_ACCOUNT_PRIVATE_KEY_PATTERN, replacement: REDACTED },
  { pattern: UNTERMINATED_PRIVATE_KEY_PATTERN, replacement: REDACTED },
  {
    pattern: AUTHORIZATION_BEARER_HEADER_PATTERN,
    replacement: `$1${REDACTED}`,
  },
  { pattern: API_KEY_HEADER_PATTERN, replacement: `$1${REDACTED}` },
  { pattern: CREDENTIAL_QUERY_PARAM_PATTERN, replacement: `$1${REDACTED}` },
];

// Redacts every literal occurrence of a secret value the caller already
// resolved (e.g. the row's own API key or decrypted credential) — this
// catches opaque tokens with no distinctive shape (a Sentry auth token, a
// Hashnode/DEV.to API key) that no pattern above can recognize. A very
// short value is skipped: at that length it's more likely a stray digit or
// short identifier than a real secret, and blanket-replacing it would
// mangle unrelated parts of the message.
const MINIMUM_EXACT_MATCH_SECRET_LENGTH = 8;

function redactKnownSecretValue(
  message: string,
  knownSecret: string | undefined,
): string {
  if (!knownSecret || knownSecret.length < MINIMUM_EXACT_MATCH_SECRET_LENGTH) {
    return message;
  }
  return message.split(knownSecret).join(REDACTED);
}

/**
 * Strips known secret material from a vendor-originated error string before
 * it's safe to persist or return to a caller. Pure and synchronous — no
 * I/O, so it's unit-testable in isolation from the orchestrator that calls
 * it.
 *
 * `knownSecret`, when passed, is redacted exactly (see
 * redactKnownSecretValue) in addition to the pattern-based passes below —
 * pass the credential this sync attempt actually resolved, when one was
 * resolved, so a shape the pattern list doesn't recognize still gets
 * caught.
 */
export function redactSecrets(message: string, knownSecret?: string): string {
  const patternRedacted = REDACTION_STEPS.reduce(
    (redactedMessage, { pattern, replacement }) =>
      redactedMessage.replace(pattern, replacement),
    message,
  );
  return redactKnownSecretValue(patternRedacted, knownSecret);
}
