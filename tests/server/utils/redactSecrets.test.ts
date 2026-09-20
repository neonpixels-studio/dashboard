import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../../server/utils/redactSecrets";

describe("redactSecrets", () => {
  it("leaves a plain, secret-free error message untouched", () => {
    const message = "Sentry 500: Internal Server Error";
    expect(redactSecrets(message)).toBe(message);
  });

  it("redacts a Stripe-style live secret key embedded in a vendor error", () => {
    // Representative of what the real Stripe SDK/Node http client can echo
    // back when a request fails, e.g. logging the request it just sent.
    // Suffix kept short/low-entropy (matches the "sk_test_unused" style
    // already used in tests/server/integrations/stripe/*.test.ts) so this
    // stays an obvious fixture, not something a secret scanner mistakes for
    // a real key.
    const message = "Invalid API Key provided: sk_test_leaked";
    expect(redactSecrets(message)).toBe("Invalid API Key provided: [REDACTED]");
  });

  it("redacts a bearer token in a plain-text Authorization header", () => {
    // Uses an opaque, non-Stripe-shaped token so this exercises the bearer
    // pattern itself rather than incidentally passing via the Stripe-key
    // pattern that runs first.
    const message =
      "Request failed: POST https://api.example.com/v1/report " +
      "with Authorization: Bearer opaque-vendor-token";
    const redacted = redactSecrets(message);

    expect(redacted).not.toContain("opaque-vendor-token");
    expect(redacted).toContain("Authorization: Bearer [REDACTED]");
  });

  it("redacts a bearer token from a JSON-serialized headers object", () => {
    // Several vendor SDKs (axios's error.toJSON(), undici) stringify the
    // request config into the error message rather than logging plain
    // headers.
    const message =
      'Request failed {"headers":{"authorization":"Bearer opaque-vendor-token"}}';
    const redacted = redactSecrets(message);

    expect(redacted).not.toContain("opaque-vendor-token");
    expect(redacted).toContain('"authorization":"Bearer [REDACTED]"');
  });

  it("redacts an x-api-key header dumped into an error", () => {
    const message = "403 Forbidden — x-api-key: leaked-header-value";
    expect(redactSecrets(message)).toBe(
      "403 Forbidden — x-api-key: [REDACTED]",
    );
  });

  it("redacts an x-api-key header from a JSON-serialized headers object", () => {
    const message =
      'Request failed {"headers":{"x-api-key":"leaked-header-value"}}';
    const redacted = redactSecrets(message);

    expect(redacted).not.toContain("leaked-header-value");
    expect(redacted).toContain('"x-api-key":"[REDACTED]"');
  });

  it("redacts credential query params echoed back in a request URL", () => {
    const message =
      "GET https://api.example.com/v1/report?property=123&api_key=leaked-query-value failed with 401";
    const redacted = redactSecrets(message);

    expect(redacted).not.toContain("leaked-query-value");
    expect(redacted).toContain("?property=123&api_key=[REDACTED]");
  });

  it("redacts every secret-shaped occurrence when a message carries more than one", () => {
    const message =
      "sync failed: key sk_live_first and again sk_live_second " +
      "were both rejected, retried with ?token=leaked-token";
    const redacted = redactSecrets(message);

    expect(redacted).not.toContain("sk_live_first");
    expect(redacted).not.toContain("sk_live_second");
    expect(redacted).not.toContain("leaked-token");
  });

  describe("GA4 service account PEM private keys", () => {
    it("redacts a complete PEM block", () => {
      // Matches the stub shape used by tests/server/integrations/ga4/
      // provider.test.ts — a literal "..." body, which can never appear in
      // a real key, so it can't be mistaken for one by a reader or a
      // secret scanner.
      const privateKey =
        "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n";
      const message = `Failed to authenticate GA4 client with credentials: ${privateKey}`;
      const redacted = redactSecrets(message);

      expect(redacted).not.toContain(privateKey);
      expect(redacted).toContain("[REDACTED]");
    });

    it("redacts a PEM block truncated before its END marker", () => {
      // A vendor error (or util.inspect's default string-length cap) can
      // cut a long message off mid-key, before "-----END PRIVATE KEY-----"
      // ever appears. Without a fallback for this, the key body would
      // survive verbatim.
      const truncatedPrivateKey = "-----BEGIN PRIVATE KEY-----\nMIIEv...";
      const message = `Failed to authenticate GA4 client with credentials: ${truncatedPrivateKey}`;
      const redacted = redactSecrets(message);

      expect(redacted).not.toContain("MIIEv");
      expect(redacted).toContain("[REDACTED]");
    });
  });

  describe("knownSecret exact-match redaction", () => {
    it("redacts a literal occurrence of the resolved secret even with no recognizable shape", () => {
      // An opaque vendor token (e.g. a Sentry auth token or DEV.to API key)
      // matches none of the pattern-based passes, but the orchestrator
      // already has its literal value in hand for this sync attempt.
      const knownSecret = "opaque-sentry-auth-token";
      const message = `Sentry request failed: token ${knownSecret} was rejected`;
      const redacted = redactSecrets(message, knownSecret);

      expect(redacted).not.toContain(knownSecret);
      expect(redacted).toBe(
        "Sentry request failed: token [REDACTED] was rejected",
      );
    });

    it("ignores a knownSecret shorter than the minimum length, rather than mangling unrelated text", () => {
      const message = "Sentry request failed: retry count 42 exceeded";
      expect(redactSecrets(message, "42")).toBe(message);
    });

    it("does nothing extra when no knownSecret is passed", () => {
      const message = "Sentry 500: Internal Server Error";
      expect(redactSecrets(message)).toBe(message);
    });
  });
});
