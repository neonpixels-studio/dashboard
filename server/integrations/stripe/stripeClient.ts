import Stripe from "stripe";
import { toStripeSubscription } from "./mapping";
import { SUBSCRIPTIONS_PAGE_SIZE } from "./mrr";
import type { ListActiveSubscriptions } from "./types";

// A hung Stripe request would otherwise block a sync indefinitely (no
// independent deadline on a Netlify function); this bounds it. Stripe's own
// SDK default is 1 automatic retry — bumped slightly since a sync running on
// a schedule can tolerate a couple extra seconds far more easily than a
// transient 429/5xx failing the whole run.
const STRIPE_REQUEST_TIMEOUT_MS = 20_000;
const STRIPE_MAX_NETWORK_RETRIES = 2;

// Only the subset of the real Stripe client this package calls — narrowing
// the parameter type (rather than the full `Stripe` class) is what makes
// `createStripeSubscriptionLister` accept a lightweight test double instead
// of a real client built from a real secret key.
type StripeSubscriptionsClient = Pick<Stripe, "subscriptions">;

/**
 * Builds the real, network-touching `ListActiveSubscriptions`. `stripeClient`
 * defaults to a real Stripe SDK instance but is injectable — this is the one
 * function in server/integrations/stripe that would otherwise construct a
 * live client with no seam, unlike every other function in this package
 * (mrr.ts, provider.ts), which already takes a `ListActiveSubscriptions` as
 * a parameter and is tested against a fixture-backed fake. Deliberately
 * doesn't `expand` `items.data.price.product`: the default subscription list
 * response already includes `price.product` as a bare id string, and
 * mapping.ts's assertProductId fails loud if that ever stops being true.
 */
export function createStripeSubscriptionLister(
  secretKey: string,
  stripeClient: StripeSubscriptionsClient = new Stripe(secretKey, {
    apiVersion: Stripe.API_VERSION,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
  }),
): ListActiveSubscriptions {
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
