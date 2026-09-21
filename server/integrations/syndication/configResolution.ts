import type { IntegrationConfig } from "../types";

// Shared "row overrides shared env default" resolver for THIS package:
// Hashnode's publication id and Medium's username both follow the same
// "config row wins, else a shared studio env var" precedent
// server/integrations/stripe/provider.ts's resolveProductIdsSource and
// server/integrations/ga4/provider.ts's resolvePropertyId already
// established — this is the syndication package's shared copy so
// Hashnode/Medium don't each redeclare it. Stripe/GA4 still have their own
// pre-existing, unchanged copies of the same logic (out of scope here — see
// the Code Standards note on changing only what a task requires); pointing
// them at this one too is a reasonable follow-up, not done in this PR. DEV.to
// has no equivalent here — its API key alone identifies the account, no
// separate external id.
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
