import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  IntegrationConfigError,
  resolveIntegrationConfig,
} from "../../../server/integrations/config";
import {
  encryptSecret,
  IntegrationSecretError,
} from "../../../server/utils/integrationSecrets";
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
  vi.unstubAllGlobals();
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

  it("throws an IntegrationConfigError when secretRef names an env var that isn't set", () => {
    vi.stubEnv("NUXT_SENTRY_UNSET_TOKEN", undefined);
    const row = buildRow({ secretRef: "NUXT_SENTRY_UNSET_TOKEN" });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      IntegrationConfigError,
    );
    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /NUXT_SENTRY_UNSET_TOKEN/,
    );
  });

  it("throws when secretRef names an env var set to an empty string", () => {
    vi.stubEnv("NUXT_SENTRY_EMPTY_TOKEN", "");
    const row = buildRow({ secretRef: "NUXT_SENTRY_EMPTY_TOKEN" });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /NUXT_SENTRY_EMPTY_TOKEN/,
    );
  });

  it("throws when secretRef isn't scoped to the row's own vendor", () => {
    const row = buildRow({ vendor: "sentry", secretRef: "NUXT_STRIPE_TOKEN" });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      IntegrationConfigError,
    );
    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /must start with "NUXT_SENTRY_"/,
    );
  });

  it("throws when secretRef targets an unrelated, non-integration secret", () => {
    vi.stubEnv("NUXT_INTEGRATION_ENCRYPTION_KEY", "some-value");
    const row = buildRow({
      vendor: "sentry",
      secretRef: "NUXT_INTEGRATION_ENCRYPTION_KEY",
    });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /must start with "NUXT_SENTRY_"/,
    );
  });

  it("throws when a vendor-scoped secretRef's trailing segment belongs to a different app", () => {
    vi.stubEnv("NUXT_CLERK_SECRET_KEY_BASIN", "basins-secret");
    const row = buildRow({
      slug: "wanderist",
      vendor: "clerk",
      secretRef: "NUXT_CLERK_SECRET_KEY_BASIN",
    });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      IntegrationConfigError,
    );
    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      /belongs to app "basin", not "wanderist"/,
    );
  });

  it("accepts a per-app, slug-suffixed secretRef scoped to the vendor (e.g. clerk)", () => {
    vi.stubEnv("NUXT_CLERK_SECRET_KEY_BASIN", "clerk-secret");
    const row = buildRow({
      slug: "basin",
      vendor: "clerk",
      secretRef: "NUXT_CLERK_SECRET_KEY_BASIN",
    });

    const config = resolveIntegrationConfig(row, vi.fn());

    expect(config.secret).toBe("clerk-secret");
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

  it("wraps a decrypt failure in an IntegrationSecretError carrying the row's slug:vendor identity", () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const row = buildRow({
      slug: "wanderist",
      vendor: "clerk",
      encryptedSecret: encryptSecret("per-app-secret", key, "wanderist:clerk"),
    });

    expect(() => resolveIntegrationConfig(row, () => wrongKey)).toThrow(
      IntegrationSecretError,
    );
    expect(() => resolveIntegrationConfig(row, () => wrongKey)).toThrow(
      /wanderist:clerk/,
    );
  });

  it("propagates a broken decryption-key loader without relabeling it as a decrypt failure", () => {
    const row = buildRow({
      encryptedSecret: encryptSecret(
        "per-app-secret",
        randomBytes(32),
        "basin:sentry",
      ),
    });
    const loadDecryptionKey = () => {
      throw new IntegrationSecretError(
        "Integration encryption key is missing.",
      );
    };

    expect(() => resolveIntegrationConfig(row, loadDecryptionKey)).toThrow(
      "Integration encryption key is missing.",
    );
  });

  it("returns null when neither secretRef nor encryptedSecret is set", () => {
    const row = buildRow({ secretRef: null, encryptedSecret: null });

    const config = resolveIntegrationConfig(row, vi.fn());

    expect(config.secret).toBeNull();
  });

  it("throws when a row somehow has both secretRef and encryptedSecret set", () => {
    vi.stubEnv("NUXT_SENTRY_BOTH_TOKEN", "from-env");
    const key = randomBytes(32);
    const row = buildRow({
      secretRef: "NUXT_SENTRY_BOTH_TOKEN",
      encryptedSecret: encryptSecret("from-encrypted", key, "basin:sentry"),
    });

    expect(() => resolveIntegrationConfig(row, () => key)).toThrow(
      IntegrationConfigError,
    );
    expect(() => resolveIntegrationConfig(row, () => key)).toThrow(
      /has both secret_ref and encrypted_secret set/,
    );
  });

  it("throws an IntegrationConfigError when the row is not enabled", () => {
    const row = buildRow({ enabled: false });

    expect(() => resolveIntegrationConfig(row, vi.fn())).toThrow(
      IntegrationConfigError,
    );
  });

  it("uses loadIntegrationEncryptionKey as the default decryption key loader", () => {
    const key = randomBytes(32);
    vi.stubGlobal("useRuntimeConfig", () => ({
      integrationEncryptionKey: key.toString("base64"),
    }));
    const row = buildRow({
      slug: "wanderist",
      vendor: "clerk",
      encryptedSecret: encryptSecret("per-app-secret", key, "wanderist:clerk"),
    });

    const config = resolveIntegrationConfig(row);

    expect(config.secret).toBe("per-app-secret");
  });
});
