import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { resolveIntegrationConfig } from "../../../server/integrations/config";
import { encryptSecret } from "../../../server/utils/integrationSecrets";
import type { IntegrationConfigRow } from "../../../server/integrations/types";

function buildRow(
  overrides: Partial<IntegrationConfigRow> = {},
): IntegrationConfigRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "sentry",
    enabled: true,
    externalId: "project-slug",
    secretRef: null,
    encryptedSecret: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveIntegrationConfig", () => {
  it("resolves a shared env-var secret without ever calling loadDecryptionKey", () => {
    vi.stubEnv("NUXT_SENTRY_AUTH_TOKEN", "env-secret-value");
    const row = buildRow({ secretRef: "NUXT_SENTRY_AUTH_TOKEN" });
    const loadDecryptionKey = vi.fn();

    const config = resolveIntegrationConfig(row, loadDecryptionKey);

    expect(config).toEqual({
      slug: "basin",
      vendor: "sentry",
      externalId: "project-slug",
      secret: "env-secret-value",
    });
    expect(loadDecryptionKey).not.toHaveBeenCalled();
  });

  it("throws when secretRef names an env var that isn't set", () => {
    const row = buildRow({ secretRef: "NUXT_TRULY_UNSET_TOKEN" });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /NUXT_TRULY_UNSET_TOKEN/,
    );
  });

  it("throws when secretRef doesn't match the shared-env-var naming convention", () => {
    const row = buildRow({ secretRef: "DATABASE_URL" });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /not a valid integration secret name/,
    );
  });

  it("throws when secretRef targets a reserved, non-integration secret", () => {
    vi.stubEnv("NUXT_INTEGRATION_ENCRYPTION_KEY", "some-value");
    const row = buildRow({ secretRef: "NUXT_INTEGRATION_ENCRYPTION_KEY" });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /not a valid integration secret name/,
    );
  });

  it("decrypts a per-app encrypted secret, keyed by slug:vendor", () => {
    const key = randomBytes(32);
    const row = buildRow({
      slug: "wanderist",
      vendor: "clerk",
      encryptedSecret: encryptSecret("per-app-secret", key, "wanderist:clerk"),
    });

    const config = resolveIntegrationConfig(row, () => key);

    expect(config.secret).toBe("per-app-secret");
  });

  it("wraps a decrypt failure with the row's slug:vendor identity", () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const row = buildRow({
      slug: "wanderist",
      vendor: "clerk",
      encryptedSecret: encryptSecret("per-app-secret", key, "wanderist:clerk"),
    });

    expect(() => resolveIntegrationConfig(row, () => wrongKey)).toThrow(
      /wanderist:clerk/,
    );
  });

  it("returns null when neither secretRef nor encryptedSecret is set", () => {
    const row = buildRow({ secretRef: null, encryptedSecret: null });

    const config = resolveIntegrationConfig(row, vi.fn());

    expect(config.secret).toBeNull();
  });

  it("prefers secretRef over encryptedSecret if a row somehow has both", () => {
    vi.stubEnv("NUXT_BOTH_TOKEN", "from-env");
    const key = randomBytes(32);
    const row = buildRow({
      secretRef: "NUXT_BOTH_TOKEN",
      encryptedSecret: encryptSecret("from-encrypted", key, "basin:sentry"),
    });

    const config = resolveIntegrationConfig(row, () => key);

    expect(config.secret).toBe("from-env");
  });

  it("throws when the row is not enabled", () => {
    const row = buildRow({ enabled: false });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(/not enabled/);
  });
});
