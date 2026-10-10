import { afterEach, describe, expect, it, vi } from "vitest";
import { ga4PropertyIdForApp } from "../../../../server/integrations/ga4/propertyId";
import type { IntegrationConfigRow } from "../../../../server/integrations/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

function row(overrides: Partial<IntegrationConfigRow>): IntegrationConfigRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "ga4",
    enabled: true,
    externalId: "111",
    secretRef: "SHOULD_NOT_LEAK",
    encryptedSecret: null,
    ...overrides,
  } as IntegrationConfigRow;
}

describe("ga4PropertyIdForApp", () => {
  it("returns the enabled ga4 row's external id and nothing else", () => {
    expect(ga4PropertyIdForApp([row({})], "basin")).toBe("111");
  });

  it("returns null when GA4 is disabled or absent for the app", () => {
    expect(ga4PropertyIdForApp([row({ enabled: false })], "basin")).toBeNull();
    expect(
      ga4PropertyIdForApp([row({ vendor: "sentry" })], "basin"),
    ).toBeNull();
    expect(ga4PropertyIdForApp([row({ slug: "other" })], "basin")).toBeNull();
    expect(ga4PropertyIdForApp([], "basin")).toBeNull();
  });

  it("falls back to the per-app env var when the row has no external id", () => {
    vi.stubEnv("NUXT_GA4_PROPERTY_ID_BASIN", "222");
    expect(ga4PropertyIdForApp([row({ externalId: null })], "basin")).toBe(
      "222",
    );
  });

  it("returns null when neither the row nor the env var has an id", () => {
    vi.stubEnv("NUXT_GA4_PROPERTY_ID_BASIN", "");
    expect(
      ga4PropertyIdForApp([row({ externalId: null })], "basin"),
    ).toBeNull();
  });
});
