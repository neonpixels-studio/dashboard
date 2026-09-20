import {
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_MRR,
  PERIOD_CURRENT,
} from "../../utils/dashboardMetrics";
import type {
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../types";
import { createStripeSubscriptionLister } from "./stripeClient";
import {
  computeMrrForProducts,
  fetchAllActiveSubscriptions,
  parseProductIds,
} from "./mrr";
import type { ListActiveSubscriptions } from "./types";

const STRIPE_VENDOR = "stripe";

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
function resolveProductIdsSource(config: IntegrationConfig): string | null {
  const externalId = config.externalId?.trim();
  if (externalId) {
    return externalId;
  }
  const envVarName = `NUXT_STRIPE_PRODUCT_ID_${config.slug.toUpperCase()}`;
  return process.env[envVarName] ?? null;
}

/**
 * Core fetch logic, decoupled from the real Stripe client so it can be unit
 * tested against a fixture-backed `ListActiveSubscriptions` with no network
 * call — `stripeProvider.fetch` below is the only caller that wires in the
 * real one (stripeClient.ts).
 *
 * Per the issue's account model, this provider applies only to the
 * product-template apps (basin, markpost, wanderist). Apps without a Stripe
 * row, or with a row but no product ids configured anywhere yet, simply
 * never reach here (the orchestrator only calls providers for enabled
 * config rows), and the empty-productIds branch below is this function's
 * own defense-in-depth copy of that "unconfigured -> no rows, never zeros"
 * guarantee.
 */
export async function fetchStripeMetrics(
  config: IntegrationConfig,
  listActiveSubscriptions: ListActiveSubscriptions,
): Promise<ProviderResult> {
  const productIds = parseProductIds(resolveProductIdsSource(config));
  if (!productIds.length) {
    return { metrics: [], trafficBreakdown: [], syndicationPosts: [] };
  }

  const subscriptions = await fetchAllActiveSubscriptions(
    listActiveSubscriptions,
  );
  const { mrr, activeSubscribers } = computeMrrForProducts(
    subscriptions,
    new Set(productIds),
  );
  const capturedAt = new Date();

  return {
    metrics: [
      {
        vendor: STRIPE_VENDOR,
        metric: METRIC_MRR,
        value: mrr,
        period: PERIOD_CURRENT,
        capturedAt,
      },
      {
        vendor: STRIPE_VENDOR,
        metric: METRIC_ACTIVE_SUBSCRIBERS,
        value: activeSubscribers,
        period: PERIOD_CURRENT,
        capturedAt,
      },
    ],
    trafficBreakdown: [],
    syndicationPosts: [],
  };
}

export const stripeProvider: IntegrationProvider = {
  vendor: STRIPE_VENDOR,
  async fetch(config: IntegrationConfig): Promise<ProviderResult> {
    if (!config.secret) {
      throw new Error(
        `Stripe provider for "${config.slug}" has no secret key configured.`,
      );
    }
    const listActiveSubscriptions = createStripeSubscriptionLister(
      config.secret,
    );
    return fetchStripeMetrics(config, listActiveSubscriptions);
  },
};
