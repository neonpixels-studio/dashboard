import type { IntegrationConfig } from "../types";

/**
 * Builds an IntegrationConfig for provider unit tests without going through
 * a real integration_config row or the secret-decryption path in config.ts.
 * Override only the fields a given test cares about.
 */
export function createTestIntegrationConfig(
  overrides: Partial<IntegrationConfig> = {},
): IntegrationConfig {
  return {
    slug: "test-app",
    vendor: "mock",
    externalId: null,
    secret: null,
    ...overrides,
  };
}
