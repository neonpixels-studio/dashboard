import { describe, expect, it, vi } from "vitest";
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

describe("resolveIntegrationConfig", () => {
  it("resolves a shared env-var secret without ever calling loadDecryptionKey", () => {
    process.env.NUXT_SENTRY_AUTH_TOKEN = "env-secret-value";
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
    delete process.env.NUXT_SENTRY_AUTH_TOKEN;
  });

  it("returns null when secretRef names an env var that isn't set", () => {
    delete process.env.NUXT_UNSET_TOKEN;
    const row = buildRow({ secretRef: "NUXT_UNSET_TOKEN" });

    const config = resolveIntegrationConfig(row, vi.fn());

    expect(config.secret).toBeNull();
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

  it("returns null when neither secretRef nor encryptedSecret is set", () => {
    const row = buildRow({ secretRef: null, encryptedSecret: null });

    const config = resolveIntegrationConfig(row, vi.fn());

    expect(config.secret).toBeNull();
  });

  it("prefers secretRef over encryptedSecret if a row somehow has both", () => {
    process.env.NUXT_BOTH_TOKEN = "from-env";
    const key = randomBytes(32);
    const row = buildRow({
      secretRef: "NUXT_BOTH_TOKEN",
      encryptedSecret: encryptSecret("from-encrypted", key, "basin:sentry"),
    });

    const config = resolveIntegrationConfig(row, () => key);

    expect(config.secret).toBe("from-env");
    delete process.env.NUXT_BOTH_TOKEN;
  });
});
