import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readIntegrationEnv,
  runtimeConfigKeyFor,
} from "../../../server/integrations/integrationEnv";

const ENV_VAR = "NUXT_CLERK_SECRET_KEY_BASIN";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("runtimeConfigKeyFor", () => {
  it("maps a NUXT_ env var to its camelCase runtimeConfig key", () => {
    expect(runtimeConfigKeyFor("NUXT_STRIPE_SECRET_KEY")).toBe(
      "stripeSecretKey",
    );
    expect(runtimeConfigKeyFor("NUXT_GA4_SA_PRIVATE_KEY")).toBe(
      "ga4SaPrivateKey",
    );
    expect(runtimeConfigKeyFor(ENV_VAR)).toBe("clerkSecretKeyBasin");
  });

  it("returns null for a name without the NUXT_ prefix", () => {
    expect(runtimeConfigKeyFor("DATABASE_URL")).toBeNull();
  });
});

describe("readIntegrationEnv", () => {
  it("prefers process.env when it is set", () => {
    vi.stubEnv(ENV_VAR, "from-env");
    vi.stubGlobal("useRuntimeConfig", () => ({
      clerkSecretKeyBasin: "from-config",
    }));

    expect(readIntegrationEnv(ENV_VAR)).toBe("from-env");
  });

  it("falls back to the build-time runtimeConfig value when process.env is empty", () => {
    vi.stubEnv(ENV_VAR, "");
    vi.stubGlobal("useRuntimeConfig", () => ({
      clerkSecretKeyBasin: "from-config",
    }));

    expect(readIntegrationEnv(ENV_VAR)).toBe("from-config");
  });

  it("returns undefined when neither source has a value", () => {
    vi.stubEnv(ENV_VAR, "");
    vi.stubGlobal("useRuntimeConfig", () => ({ clerkSecretKeyBasin: "" }));

    expect(readIntegrationEnv(ENV_VAR)).toBeUndefined();
  });

  it("ignores a non-string runtimeConfig entry", () => {
    vi.stubGlobal("useRuntimeConfig", () => ({ clerk: { secretKey: "x" } }));

    expect(readIntegrationEnv("NUXT_CLERK")).toBeUndefined();
  });
});
