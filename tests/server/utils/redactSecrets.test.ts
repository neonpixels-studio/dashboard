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
    const message =
      "Request failed: POST https://api.stripe.com/v1/subscriptions " +
      "with Authorization: Bearer sk_live_leaked";
    const redacted = redactSecrets(message);

    expect(redacted).not.toContain("sk_live_leaked");
    expect(redacted).toContain("Bearer [REDACTED]");
  });

  it("redacts a Stripe-style test secret key with no surrounding header", () => {
    const message = "Invalid API Key provided: sk_test_leaked";
    expect(redactSecrets(message)).toBe("Invalid API Key provided: [REDACTED]");
  });

  it("redacts a GA4 service account PEM private key", () => {
    // Matches the stub shape used by tests/server/integrations/ga4/
    // provider.test.ts — a literal "..." body, which can never appear in a
    // real key, so it can't be mistaken for one by a reader or a secret
    // scanner.
    const privateKey =
      "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n";
    const message = `Failed to authenticate GA4 client with credentials: ${privateKey}`;
    const redacted = redactSecrets(message);

    expect(redacted).not.toContain(privateKey);
    expect(redacted).toContain("[REDACTED]");
  });

  it("redacts an x-api-key header dumped into an error", () => {
    const message = "403 Forbidden — x-api-key: leaked-header-value";
    expect(redactSecrets(message)).toBe(
      "403 Forbidden — x-api-key: [REDACTED]",
    );
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
});
