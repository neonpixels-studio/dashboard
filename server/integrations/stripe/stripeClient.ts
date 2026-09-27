import Stripe from "stripe";
import { NO_DEADLINE, type FetchDeadline } from "../types";
import { toStripeSubscription } from "./mapping";
import type { ListActiveSubscriptions } from "./types";

// A hung Stripe request would otherwise block a sync indefinitely (no
// independent deadline on a Netlify function); this bounds it. Stripe's own
// SDK default is 1 automatic retry — bumped slightly since a sync running on
// a schedule can tolerate a couple extra seconds far more easily than a
// transient 429/5xx failing the whole run.
const STRIPE_REQUEST_TIMEOUT_MS = 20_000;
const STRIPE_MAX_NETWORK_RETRIES = 2;
// Stripe's maximum page size for list endpoints (the default, if omitted,
// is 10) — set explicitly so pagination doesn't depend on that default.
const SUBSCRIPTIONS_PAGE_SIZE = 100;

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
  // The Stripe SDK's per-request RequestOptions have no AbortSignal seam
  // (unlike the raw-fetch clients in sentryClient.ts/syndication/
  // httpClient.ts) — only a numeric `timeout` override. Capping it to
  // whichever is smaller, STRIPE_REQUEST_TIMEOUT_MS or what's left of the
  // shared run budget (see ../types.ts's FetchDeadline), is this client's
  // adaptation of that same "don't outlive the run budget" guarantee.
  // Defaults to NO_DEADLINE so exercising this function directly (every
  // existing unit test) needs no deadline at all.
  deadline: FetchDeadline = NO_DEADLINE,
): ListActiveSubscriptions {
  return async (startingAfter) => {
    // A `timeout` of exactly 0 doesn't mean "expire immediately" to Stripe's
    // underlying HTTP client the way this code needs — Node interprets a
    // socket timeout of 0 as "no timeout at all," the opposite of the intent
    // here. Failing loud instead of ever placing that call keeps this
    // client's own guarantee (never outlive the shared run budget) true even
    // at the boundary.
    const cappedTimeoutMs = Math.min(
      STRIPE_REQUEST_TIMEOUT_MS,
      deadline.remainingMs(),
    );
    if (cappedTimeoutMs <= 0) {
      throw new Error(
        "Stripe subscription list skipped: the sync's shared run budget was already exhausted.",
      );
    }

    // `status: "active"` only — `trialing` and `past_due` subscriptions are
    // excluded, and MRR is computed from each price's list amount with no
    // discount/coupon applied (`subscription.discounts` isn't fetched or
    // read). Both are deliberate scope boundaries for this first pass, not
    // oversights: whether a past-due (in dunning, often recovered) or
    // trialing subscription should count, and whether MRR should reflect
    // discounted vs. list price, are product decisions, not something to
    // guess at here — tracked as follow-ups.
    // Deliberately does NOT also override `maxNetworkRetries` here — Stripe
    // retries against the SAME per-attempt `timeout` above, so a retried
    // call can still exceed what was left of the shared deadline at the
    // moment this call was placed. Forcing retries to 0 whenever the
    // deadline (rather than STRIPE_REQUEST_TIMEOUT_MS) is the binding
    // constraint would close that gap, but under runSync's real
    // DEFAULT_RUN_BUDGET_MS (7s, well under STRIPE_REQUEST_TIMEOUT_MS's
    // 20s) that condition is true on effectively every production call,
    // permanently defeating STRIPE_MAX_NETWORK_RETRIES's whole reason for
    // existing (see its own comment) rather than only on a genuinely
    // tight-budget edge case. The per-attempt timeout is still clamped to
    // the deadline, so any overrun here is bounded by a small, shrinking
    // multiple of what's actually left of the run budget — not the
    // unbounded-by-this-client's-own-logic overrun a hung request without
    // any deadline at all would risk.
    const page = await stripeClient.subscriptions.list(
      {
        status: "active",
        limit: SUBSCRIPTIONS_PAGE_SIZE,
        starting_after: startingAfter,
      },
      { timeout: cappedTimeoutMs },
    );

    return {
      data: page.data.map(toStripeSubscription),
      hasMore: page.has_more,
    };
  };
}
