import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveExternalIdOrEnvVar } from "../../../../server/integrations/syndication/configResolution";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveExternalIdOrEnvVar", () => {
  it("prefers integration_config.external_id over the env var when both are set", () => {
    vi.stubEnv("SOME_ENV_VAR", "from-env");
    const config = createTestIntegrationConfig({ externalId: "from-row" });

    expect(resolveExternalIdOrEnvVar(config, "SOME_ENV_VAR")).toBe("from-row");
  });

  it("falls back to the env var when external_id is unset", () => {
    vi.stubEnv("SOME_ENV_VAR", "from-env");
    const config = createTestIntegrationConfig({ externalId: null });

    expect(resolveExternalIdOrEnvVar(config, "SOME_ENV_VAR")).toBe("from-env");
  });

  it("treats a whitespace-only external_id as unset", () => {
    vi.stubEnv("SOME_ENV_VAR", "from-env");
    const config = createTestIntegrationConfig({ externalId: "   " });

    expect(resolveExternalIdOrEnvVar(config, "SOME_ENV_VAR")).toBe("from-env");
  });

  it("returns null when neither source is set", () => {
    const config = createTestIntegrationConfig({ externalId: null });

    expect(resolveExternalIdOrEnvVar(config, "SOME_UNSET_ENV_VAR")).toBeNull();
  });
});
