import Stripe from "stripe";
import { toStripeSubscription } from "./mapping";
import { SUBSCRIPTIONS_PAGE_SIZE } from "./mrr";
import type { ListActiveSubscriptions } from "./types";

/**
 * Builds the real, network-touching `ListActiveSubscriptions`. This is the
 * one function in server/integrations/stripe that constructs a live Stripe
 * client — every other function in this package (mrr.ts, provider.ts) takes
 * a `ListActiveSubscriptions` as a parameter instead, so they're unit-tested
 * against a fixture-backed fake with the same signature and never need this
 * file. Deliberately doesn't `expand` `items.data.price.product`: the
 * default subscription list response already includes `price.product` as a
 * bare id string, and mapping.ts's assertProductId fails loud if that ever
 * stops being true.
 */
export function createStripeSubscriptionLister(
  secretKey: string,
): ListActiveSubscriptions {
  const stripeClient = new Stripe(secretKey);

  return async (startingAfter) => {
    const page = await stripeClient.subscriptions.list({
      status: "active",
      limit: SUBSCRIPTIONS_PAGE_SIZE,
      starting_after: startingAfter,
    });

    return {
      data: page.data.map(toStripeSubscription),
      hasMore: page.has_more,
    };
  };
}
