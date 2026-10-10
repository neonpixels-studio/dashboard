import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredProductIds,
  resolveProductIdsSource,
} from "../../../../server/integrations/stripe/productIds";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuredProductIds", () => {
  it("prefers the row's external_id over the shared env var", () => {
    vi.stubEnv("NUXT_STRIPE_PRODUCT_ID_BASIN", "prod_env");

    expect(
      configuredProductIds({ slug: "basin", externalId: "prod_a, prod_b" }),
    ).toEqual(["prod_a", "prod_b"]);
  });

  it("falls back to NUXT_STRIPE_PRODUCT_ID_<SLUG>", () => {
    vi.stubEnv("NUXT_STRIPE_PRODUCT_ID_BASIN", "prod_env");

    expect(resolveProductIdsSource({ slug: "basin", externalId: "  " })).toBe(
      "prod_env",
    );
    expect(configuredProductIds({ slug: "basin", externalId: null })).toEqual([
      "prod_env",
    ]);
  });

  it("is empty when nothing is configured", () => {
    vi.stubEnv("NUXT_STRIPE_PRODUCT_ID_BASIN", "");
    vi.stubGlobal("useRuntimeConfig", () => ({}));

    expect(configuredProductIds({ slug: "basin", externalId: null })).toEqual(
      [],
    );
    vi.unstubAllGlobals();
  });
});
