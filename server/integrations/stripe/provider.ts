import {
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_MRR,
  PERIOD_CURRENT,
} from "../../utils/dashboardMetrics";
import { reportError } from "../../utils/errorReporting";
import { NO_DEADLINE } from "../types";
import type {
  FetchDeadline,
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../types";
import { createStripeSubscriptionLister } from "./stripeClient";
import { createStripeDetailSource } from "./stripeDetailClient";
import { buildEventRows, fetchActivityEvents } from "./activity";
import { computePlanRevenue } from "./planRevenue";
import { computeMrrForProducts, fetchAllActiveSubscriptions } from "./mrr";
import { configuredProductIds } from "./productIds";
import type {
  ListActiveSubscriptions,
  StripeDetailSource,
  StripeSubscription,
} from "./types";

const STRIPE_VENDOR = "stripe";

async function resolvePlanNames(
  productIds: Set<string>,
  detailSource: StripeDetailSource,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    [...productIds].map(
      async (productId) =>
        [productId, await detailSource.getProductName(productId)] as const,
    ),
  );
  return new Map(entries);
}

async function fetchStripeDetail(
  subscriptions: StripeSubscription[],
  productIds: Set<string>,
  detailSource: StripeDetailSource,
  now: Date,
): Promise<NonNullable<ProviderResult["stripeDetail"]>> {
  const planNames = await resolvePlanNames(productIds, detailSource);
  const events = await fetchActivityEvents(detailSource);
  return {
    planRevenue: computePlanRevenue(subscriptions, productIds, planNames, now),
    events: await buildEventRows(events, productIds, planNames, detailSource),
  };
}

// The revenue-by-plan / events enrichment must never cost the core MRR
// metrics: a key without Events read, a customer lookup failing, or a
// non-USD event would otherwise fail the whole Stripe sync. A failure here is
// reported to Sentry and leaves the previously stored detail untouched
// (`stripeDetail` omitted) while the metrics still persist.
async function fetchStripeDetailSafely(
  slug: string,
  ...detailArguments: Parameters<typeof fetchStripeDetail>
): Promise<ProviderResult["stripeDetail"]> {
  try {
    return await fetchStripeDetail(...detailArguments);
  } catch (error) {
    reportError("stripe: detail fetch failed", error, { slug });
    return undefined;
  }
}

/**
 * Core fetch logic, decoupled from the real Stripe client so it can be unit
 * tested against a fixture-backed `ListActiveSubscriptions` with no network
 * call — `stripeProvider.fetch` below is the only caller that wires in the
 * real one (stripeClient.ts).
 *
 * Per the issue's account model, this provider applies only to the
 * product-template apps (basin, markpost, farflung). Apps without a Stripe
 * row, or with a row but no product ids configured anywhere yet, simply
 * never reach here (the orchestrator only calls providers for enabled
 * config rows), and the empty-productIds branch below is this function's
 * own defense-in-depth copy of that "unconfigured -> no rows, never zeros"
 * guarantee.
 *
 * `detailSource` is optional: when given, the result also carries the money
 * panel's revenue-by-plan and recent events (`stripeDetail`); without it the
 * result is exactly the two MRR metrics.
 */
export async function fetchStripeMetrics(
  config: IntegrationConfig,
  listActiveSubscriptions: ListActiveSubscriptions,
  detailSource?: StripeDetailSource,
): Promise<ProviderResult> {
  const productIds = configuredProductIds(config);
  if (!productIds.length) {
    return { metrics: [], trafficBreakdown: [], syndicationPosts: [] };
  }

  const subscriptions = await fetchAllActiveSubscriptions(
    listActiveSubscriptions,
  );
  const productIdSet = new Set(productIds);
  const { mrr, activeSubscribers } = computeMrrForProducts(
    subscriptions,
    productIdSet,
  );
  const capturedAt = new Date();
  const stripeDetail = detailSource
    ? await fetchStripeDetailSafely(
        config.slug,
        subscriptions,
        productIdSet,
        detailSource,
        capturedAt,
      )
    : undefined;

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
    ...(stripeDetail ? { stripeDetail } : {}),
  };
}

export const stripeProvider: IntegrationProvider = {
  vendor: STRIPE_VENDOR,
  async fetch(
    config: IntegrationConfig,
    deadline: FetchDeadline = NO_DEADLINE,
  ): Promise<ProviderResult> {
    if (!config.secret) {
      throw new Error(
        `Stripe provider for "${config.slug}" has no secret key configured.`,
      );
    }
    // The 2nd positional arg (the real Stripe SDK client) is left undefined
    // so createStripeSubscriptionLister falls through to its own default;
    // only the 3rd, `deadline`, is being overridden here.
    const listActiveSubscriptions = createStripeSubscriptionLister(
      config.secret,
      undefined,
      deadline,
    );
    const detailSource = createStripeDetailSource(
      config.secret,
      undefined,
      deadline,
    );
    return fetchStripeMetrics(config, listActiveSubscriptions, detailSource);
  },
};
