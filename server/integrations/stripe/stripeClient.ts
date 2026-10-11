import Stripe from "stripe";
import { NO_DEADLINE, type FetchDeadline } from "../types";
import { toStripeSubscription } from "./mapping";
import { MRR_COUNTED_STATUSES } from "./mrr";
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

// Stripe caps an expand path at four properties, so item-level coupons
// ("data.items.data.discounts.source.coupon" is six) can't be expanded in
// the list call. Only the discounts themselves are; their coupons are
// resolved separately (see resolveCoupons below).
const SUBSCRIPTION_EXPANDS = ["data.discounts", "data.items.data.discounts"];

// Only the subset of the real Stripe client this package calls — narrowing
// the parameter type (rather than the full `Stripe` class) is what makes
// `createStripeSubscriptionLister` accept a lightweight test double instead
// of a real client built from a real secret key.
type StripeSubscriptionsClient = Pick<Stripe, "subscriptions" | "coupons">;

// `applies_to` is not on a coupon by default; without expanding it a
// product-restricted coupon is indistinguishable from an unrestricted one.
const COUPON_EXPANDS = ["applies_to"];

type CouponLookup = (couponId: string) => Promise<Stripe.Coupon>;

// Replaces each discount's bare coupon id with the full coupon. `lookup`
// caches by id (a handful of coupons back many discounts), so a sync makes
// one retrieve per distinct coupon, not one per discount.
async function resolveDiscountCoupon(
  discount: string | Stripe.Discount,
  lookup: CouponLookup,
): Promise<string | Stripe.Discount> {
  if (typeof discount === "string") {
    return discount;
  }
  const couponId =
    typeof discount.source.coupon === "string"
      ? discount.source.coupon
      : discount.source.coupon?.id;
  if (!couponId) {
    return discount;
  }
  const coupon = await lookup(couponId);
  return { ...discount, source: { ...discount.source, coupon } };
}

async function resolveSubscriptionCoupons(
  subscription: Stripe.Subscription,
  lookup: CouponLookup,
): Promise<Stripe.Subscription> {
  const resolveAll = (discounts: Array<string | Stripe.Discount>) =>
    Promise.all(
      discounts.map((discount) => resolveDiscountCoupon(discount, lookup)),
    );
  const items = await Promise.all(
    subscription.items.data.map(async (item) => ({
      ...item,
      discounts: await resolveAll(item.discounts),
    })),
  );
  return {
    ...subscription,
    items: { ...subscription.items, data: items },
    discounts: await resolveAll(subscription.discounts),
  };
}

function createCachedCouponLookup(
  stripeClient: StripeSubscriptionsClient,
  timeoutMs: () => number,
): CouponLookup {
  const cache = new Map<string, Promise<Stripe.Coupon>>();
  return (couponId) => {
    const cached = cache.get(couponId);
    if (cached) {
      return cached;
    }
    const pending = stripeClient.coupons
      .retrieve(couponId, { expand: COUPON_EXPANDS }, { timeout: timeoutMs() })
      .catch((error: unknown) => {
        // Don't let one transient failure poison this coupon id for the
        // lister's lifetime; a deleted coupon fails loud with its id.
        cache.delete(couponId);
        throw new Error(
          `Could not retrieve Stripe coupon "${couponId}" attached to a subscription discount: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    cache.set(couponId, pending);
    return pending;
  };
}

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

// A non-positive timeout would mean "no timeout" to the Node HTTP layer, so
// an exhausted shared budget must stop the call instead.
export function perAttemptTimeoutOrThrow(deadline: FetchDeadline): number {
  const perAttemptTimeoutMs = capStripeTimeoutPerAttempt(
    deadline.remainingMs(),
  );
  if (perAttemptTimeoutMs <= 0) {
    throw new Error(
      "Stripe request skipped: the sync's shared run budget was already exhausted.",
    );
  }
  return perAttemptTimeoutMs;
}

export function createStripeSdkClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: Stripe.API_VERSION,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
  });
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
  stripeClient: StripeSubscriptionsClient = createStripeSdkClient(secretKey),
  // See capStripeTimeoutPerAttempt above for how this becomes the per-call
  // `timeout` below. Defaults to NO_DEADLINE so exercising this function
  // directly (every existing unit test) needs no deadline at all.
  deadline: FetchDeadline = NO_DEADLINE,
): ListActiveSubscriptions {
  const couponLookup = createCachedCouponLookup(stripeClient, () =>
    perAttemptTimeoutOrThrow(deadline),
  );
  return async (startingAfter) => {
    const perAttemptTimeoutMs = perAttemptTimeoutOrThrow(deadline);

    // No `status` filter: Stripe's default returns every non-canceled
    // subscription (active, past_due, trialing, unpaid, ...). Which of those
    // count is decided by MRR_COUNTED_STATUSES (mrr.ts), applied below
    // before coupon resolution and re-checked in mrr.ts; `status: "all"` is
    // avoided since it would also page through the account's entire
    // canceled history. Discounts are expanded (and their coupons resolved
    // below) so mrr.ts can apply the ones currently in effect.
    const page = await stripeClient.subscriptions.list(
      {
        expand: SUBSCRIPTION_EXPANDS,
        limit: SUBSCRIPTIONS_PAGE_SIZE,
        starting_after: startingAfter,
      },
      { timeout: perAttemptTimeoutMs },
    );

    // Uncounted statuses (trialing, unpaid, ...) never reach mrr.ts's tally,
    // so skip them here: resolving their coupons is wasted calls and a
    // deleted coupon on one would otherwise fail the whole sync.
    const countedSubscriptions = page.data.filter((subscription) =>
      MRR_COUNTED_STATUSES.has(subscription.status),
    );
    const resolved = await Promise.all(
      countedSubscriptions.map((subscription) =>
        resolveSubscriptionCoupons(subscription, couponLookup),
      ),
    );

    return {
      data: resolved.map(toStripeSubscription),
      hasMore: page.has_more,
      nextCursor: page.data.at(-1)?.id,
    };
  };
}
