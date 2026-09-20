import type { IntegrationConfig } from "../types";

// Shared "row overrides shared env default" resolver — Hashnode's
// publication id and Medium's username both follow the same precedent
// server/integrations/stripe/provider.ts's resolveProductIdsSource and
// server/integrations/ga4/provider.ts's resolvePropertyId already
// established (rule of three across the four, all doing the same "config
// row wins, else a shared studio env var" lookup); this is the syndication
// package's shared copy so Hashnode/Medium don't each redeclare it. DEV.to
// has no equivalent — its API key alone identifies the account, no separate
// external id.
export function resolveExternalIdOrEnvVar(
  config: IntegrationConfig,
  envVarName: string,
): string | null {
  const externalId = config.externalId?.trim();
  if (externalId) {
    return externalId;
  }
  const fromEnv = process.env[envVarName]?.trim();
  return fromEnv || null;
}
