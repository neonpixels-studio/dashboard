// Scrubs secret material a vendor SDK error can echo back before that error
// is ever persisted to `sync_status.error` (see
// server/integrations/orchestrator.ts's syncOneIntegration, the one write
// site this guards). Grounded in the actual secret shapes this app resolves
// (server/integrations/config.ts's resolveSecret, server/utils/
// integrationSecrets.ts): Stripe/Clerk-style `sk_live_`/`sk_test_` API keys,
// a GA4 service account's PEM private key, bearer tokens and `x-api-key`
// headers a vendor client might dump into an error message, and credential
// query params (`?api_key=`, `?key=`, `?token=`) some vendors echo back in a
// failed request's URL.
//
// Deliberately string-pattern based rather than aware of any one vendor's
// SDK: `cause.message`/`String(cause)` is already a flattened string by the
// time it reaches this function, so there's no structured request/response
// object left to redact fields on.

const STRIPE_STYLE_API_KEY_PATTERN = /\b[sr]k_(?:live|test)_[A-Za-z0-9]+/g;

const SERVICE_ACCOUNT_PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const AUTHORIZATION_BEARER_HEADER_PATTERN =
  /(authorization\s*:\s*bearer)\s+\S+/gi;

const API_KEY_HEADER_PATTERN = /(x-api-key\s*:\s*)\S+/gi;

const CREDENTIAL_QUERY_PARAM_PATTERN =
  /([?&](?:api_key|apikey|api-key|key|token|access_token|secret)=)[^&\s"'<>]+/gi;

function redactStripeStyleApiKeys(message: string): string {
  return message.replace(STRIPE_STYLE_API_KEY_PATTERN, "[REDACTED]");
}

function redactServiceAccountPrivateKeys(message: string): string {
  return message.replace(SERVICE_ACCOUNT_PRIVATE_KEY_PATTERN, "[REDACTED]");
}

function redactAuthorizationBearerHeaders(message: string): string {
  return message.replace(AUTHORIZATION_BEARER_HEADER_PATTERN, "$1 [REDACTED]");
}

function redactApiKeyHeaders(message: string): string {
  return message.replace(API_KEY_HEADER_PATTERN, "$1[REDACTED]");
}

function redactCredentialQueryParams(message: string): string {
  return message.replace(CREDENTIAL_QUERY_PARAM_PATTERN, "$1[REDACTED]");
}

// Each step below targets one secret shape and is independently testable;
// composed in sequence so a message that happens to carry more than one
// (e.g. a Stripe key AND a query-string token) gets every occurrence
// stripped, not just the first pattern that matches.
const REDACTION_STEPS: ((message: string) => string)[] = [
  redactStripeStyleApiKeys,
  redactServiceAccountPrivateKeys,
  redactAuthorizationBearerHeaders,
  redactApiKeyHeaders,
  redactCredentialQueryParams,
];

/**
 * Strips known secret material from a vendor-originated error string before
 * it's safe to persist or display. Pure and synchronous — no I/O, so it's
 * unit-testable in isolation from the orchestrator that calls it.
 */
export function redactSecrets(message: string): string {
  return REDACTION_STEPS.reduce(
    (redactedMessage, redact) => redact(redactedMessage),
    message,
  );
}
