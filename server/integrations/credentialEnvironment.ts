import type { IntegrationEnvironment } from "../../shared/types/dashboard";
import { resolveIntegrationConfig } from "./config";
import type { IntegrationConfigRow } from "./types";

// Stripe and Clerk both mint keys with an environment marker baked into the
// prefix (`sk_test_...` for a test/development instance, `sk_live_...` for
// production). Reading that marker is the only honest way to label a vendor
// "development" on the dashboard — a hand-maintained "these vendors are
// dev" list would silently go stale the day a live key is swapped in.
const DEVELOPMENT_KEY_PREFIXES = ["sk_test_", "pk_test_", "rk_test_"];
const PRODUCTION_KEY_PREFIXES = ["sk_live_", "pk_live_", "rk_live_"];

export type IntegrationEnvironmentMap = Map<string, IntegrationEnvironment>;

export function integrationEnvironmentKey(
  slug: string,
  vendor: string,
): string {
  return `${slug}:${vendor}`;
}

export function credentialEnvironment(
  secret: string | null,
): IntegrationEnvironment | null {
  if (!secret) {
    return null;
  }
  if (DEVELOPMENT_KEY_PREFIXES.some((prefix) => secret.startsWith(prefix))) {
    return "development";
  }
  if (PRODUCTION_KEY_PREFIXES.some((prefix) => secret.startsWith(prefix))) {
    return "production";
  }
  return null;
}

// Environment per enabled integration_config row, keyed by
// integrationEnvironmentKey. The plaintext secret is resolved only long
// enough to inspect its prefix and never leaves this function — the read
// endpoints (GET /api/apps, GET /api/apps/[slug]) consume the map, not the
// credential.
//
// A row whose secret can't be resolved (env var unset, undecryptable
// override) is skipped rather than failing the whole read: that same
// failure already surfaces as a sync error/alert from the orchestrator, and
// an absent tag reads as "unknown", which is the truthful answer here.
export function integrationEnvironments(
  configRows: IntegrationConfigRow[],
  loadDecryptionKey?: () => Buffer,
): IntegrationEnvironmentMap {
  const environments: IntegrationEnvironmentMap = new Map();
  for (const row of configRows.filter((config) => config.enabled)) {
    const environment = rowEnvironment(row, loadDecryptionKey);
    if (!environment) {
      continue;
    }
    environments.set(
      integrationEnvironmentKey(row.slug, row.vendor),
      environment,
    );
  }
  return environments;
}

function rowEnvironment(
  row: IntegrationConfigRow,
  loadDecryptionKey?: () => Buffer,
): IntegrationEnvironment | null {
  try {
    return credentialEnvironment(
      resolveIntegrationConfig(row, loadDecryptionKey).secret,
    );
  } catch {
    return null;
  }
}
