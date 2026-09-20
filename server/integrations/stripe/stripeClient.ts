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
    // `status: "active"` only — `trialing` and `past_due` subscriptions are
    // excluded, and MRR is computed from each price's list amount with no
    // discount/coupon applied (`subscription.discounts` isn't fetched or
    // read). Both are deliberate scope boundaries for this first pass, not
    // oversights: whether a past-due (in dunning, often recovered) or
    // trialing subscription should count, and whether MRR should reflect
    // discounted vs. list price, are product decisions, not something to
    // guess at here — tracked as follow-ups.
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
