import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  credentialEnvironment,
  integrationEnvironments,
} from "../../../server/integrations/credentialEnvironment";
import { encryptSecret } from "../../../server/utils/integrationSecrets";
import type { IntegrationConfigRow } from "../../../server/integrations/types";

function buildRow(
  overrides: Partial<IntegrationConfigRow> = {},
): IntegrationConfigRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "stripe",
    enabled: true,
    externalId: null,
    secretRef: null,
    encryptedSecret: null,
    lastAttemptAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credentialEnvironment", () => {
  it("reads a test-key prefix as development", () => {
    expect(credentialEnvironment("sk_test_abc123")).toBe("development");
    expect(credentialEnvironment("pk_test_abc123")).toBe("development");
    expect(credentialEnvironment("rk_test_abc123")).toBe("development");
  });

  it("reads a live-key prefix as production", () => {
    expect(credentialEnvironment("sk_live_abc123")).toBe("production");
    expect(credentialEnvironment("pk_live_abc123")).toBe("production");
    expect(credentialEnvironment("rk_live_abc123")).toBe("production");
  });

  it("returns null for a key with no environment marker, or no key at all", () => {
    expect(credentialEnvironment("sntrys_abc123")).toBeNull();
    expect(credentialEnvironment("")).toBeNull();
    expect(credentialEnvironment(null)).toBeNull();
  });
});

describe("integrationEnvironments", () => {
  it("keys each enabled row's environment by slug:vendor from its env-var secret", () => {
    vi.stubEnv("NUXT_STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NUXT_CLERK_SECRET_KEY_BASIN", "sk_live_abc");
    const rows = [
      buildRow({ vendor: "stripe", secretRef: "NUXT_STRIPE_SECRET_KEY" }),
      buildRow({ vendor: "clerk", secretRef: "NUXT_CLERK_SECRET_KEY_BASIN" }),
    ];

    const environments = integrationEnvironments(rows);

    expect([...environments.entries()]).toEqual([
      ["basin:stripe", "development"],
      ["basin:clerk", "production"],
    ]);
  });

  it("resolves an encrypted per-app override through the decryption key", () => {
    const key = randomBytes(32);
    const rows = [
      buildRow({
        vendor: "clerk",
        encryptedSecret: encryptSecret("sk_test_override", key, "basin:clerk"),
      }),
    ];

    const environments = integrationEnvironments(rows, () => key);

    expect(environments.get("basin:clerk")).toBe("development");
  });

  it("skips disabled rows, unmarked keys, and rows whose secret can't be resolved", () => {
    vi.stubEnv("NUXT_SENTRY_AUTH_TOKEN", "sntrys_abc");
    const rows = [
      buildRow({
        vendor: "stripe",
        enabled: false,
        secretRef: "NUXT_STRIPE_SECRET_KEY",
      }),
      buildRow({ vendor: "sentry", secretRef: "NUXT_SENTRY_AUTH_TOKEN" }),
      buildRow({ vendor: "clerk", secretRef: "NUXT_CLERK_SECRET_KEY_BASIN" }),
    ];

    expect(integrationEnvironments(rows).size).toBe(0);
  });
});
