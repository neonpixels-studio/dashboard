import { readIntegrationEnv } from "../integrationEnv";
import { parseProductIds } from "./mrr";

/**
 * Per the issue's account model, an app's product ids can live in either of
 * two places: `integration_config.external_id` (a per-row, DB-driven value
 * — set this way once an admin path for editing rows exists) or the shared
 * studio env var `NUXT_STRIPE_PRODUCT_ID_<SLUG>` (the deploy-time default —
 * see .env.example, and nuxt.config.ts's runtimeConfig for why each app's
 * var is declared there even though it's read here via `process.env`
 * directly, not `useRuntimeConfig()`). The DB row wins when set, mirroring
 * config.ts's own row-overrides-shared-default precedent.
 */
export function resolveProductIdsSource(config: {
  slug: string;
  externalId: string | null;
}): string | null {
  const externalId = config.externalId?.trim();
  if (externalId) {
    return externalId;
  }
  const envVarName = `NUXT_STRIPE_PRODUCT_ID_${config.slug.toUpperCase()}`;
  return readIntegrationEnv(envVarName) ?? null;
}

/** The product ids an app's Stripe row is scoped to, empty when unconfigured. */
export function configuredProductIds(config: {
  slug: string;
  externalId: string | null;
}): string[] {
  return parseProductIds(resolveProductIdsSource(config));
}
