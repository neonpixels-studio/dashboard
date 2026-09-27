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

// The Stripe SDK's per-request RequestOptions have no AbortSignal seam
// (unlike the raw-fetch clients in sentryClient.ts/syndication/
// httpClient.ts) — only a numeric `timeout`, reused as-is for every
// automatic retry (STRIPE_MAX_NETWORK_RETRIES). A single, un-divided
// `Math.min(STRIPE_REQUEST_TIMEOUT_MS, remainingMs)` per attempt would let
// a retried call still take up to (1 + STRIPE_MAX_NETWORK_RETRIES) times
// that long in the worst case — comfortably outliving what was actually
// left of the shared run budget (see ../types.ts's FetchDeadline) at the
// moment the call was placed.
//
// `Infinity` (NO_DEADLINE, or any deadline with no real bound) is handled
// separately, keeping this client's un-deadlined behavior exactly what it
// was before FetchDeadline existed: each of up to 1 + STRIPE_MAX_NETWORK_RETRIES
// attempts gets the full STRIPE_REQUEST_TIMEOUT_MS. Dividing an infinite
// budget by anything is still infinite, so this guard isn't just an
// optimization — without it `Math.min` would happily pass `Infinity`
// through to a real, finite `remainingMs` on every OTHER branch, but here
// it's the deliberate "unconstrained" case that must keep its original,
// larger per-attempt allowance rather than being shrunk for no reason.
//
// Once an actual deadline IS the binding constraint, this divides what's
// left across every attempt Stripe might make (including retries) instead —
// each attempt gets a smaller slice, but the retried call's total worst-case
// duration stays bounded to roughly what was left of the shared budget,
// not a multiple of it.
function capStripeTimeoutPerAttempt(remainingMs: number): number {
  if (remainingMs === Infinity) {
    return STRIPE_REQUEST_TIMEOUT_MS;
  }
  const totalAttempts = 1 + STRIPE_MAX_NETWORK_RETRIES;
  return Math.min(
    STRIPE_REQUEST_TIMEOUT_MS,
    Math.floor(remainingMs / totalAttempts),
  );
}

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
  // See capStripeTimeoutPerAttempt above for how this becomes the per-call
  // `timeout` below. Defaults to NO_DEADLINE so exercising this function
  // directly (every existing unit test) needs no deadline at all.
  deadline: FetchDeadline = NO_DEADLINE,
): ListActiveSubscriptions {
  return async (startingAfter) => {
    const perAttemptTimeoutMs = capStripeTimeoutPerAttempt(
      deadline.remainingMs(),
    );
    if (perAttemptTimeoutMs <= 0) {
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
    const page = await stripeClient.subscriptions.list(
      {
        status: "active",
        limit: SUBSCRIPTIONS_PAGE_SIZE,
        starting_after: startingAfter,
      },
      { timeout: perAttemptTimeoutMs },
    );

    return {
      data: page.data.map(toStripeSubscription),
      hasMore: page.has_more,
    };
  };
}
