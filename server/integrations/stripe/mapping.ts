import type Stripe from "stripe";
import type {
  StripePrice,
  StripeRecurring,
  StripeSubscription,
  StripeSubscriptionItem,
} from "./types";

// `Stripe.Price.product` is typed as `string | Stripe.Product |
// Stripe.DeletedProduct` because the SDK supports expanding it into a full
// object. This provider never passes `expand` for `product` (see
// stripeClient.ts), so at runtime it is always the bare id — this guard
// makes that assumption explicit and fails loud (per the project's
// fail-loud standard) instead of silently mis-scoping revenue if a future
// edit ever adds that expand.
function assertProductId(product: Stripe.Price["product"]): string {
  if (typeof product !== "string") {
    throw new Error(
      "Stripe price.product was expanded to an object; " +
        "server/integrations/stripe/stripeClient.ts must list subscriptions " +
        "without expanding product.",
    );
  }
  return product;
}

// `subscription.items` is itself a paginated Stripe list (`ApiList`, with
// its own `has_more`), separate from `subscriptions.list`'s own top-level
// pagination that fetchAllActiveSubscriptions (mrr.ts) already guards.
// Stripe subscriptions can carry more items than fit on that inline page, in
// which case `items.data` here is silently truncated. Unlike the interval
// check (deliberately deferred to mrr.ts, scoped to one app — see
// StripeRecurring["interval"]'s comment in ./types.ts), this can't be scoped
// the same way: a truncated item list might be hiding the very item that
// would have matched a given app's product ids, so under-counting MRR is
// possible for ANY app, not just one identifiable one. Failing loud here,
// for every subscription, is the only safe option.
function assertNoTruncatedItems(subscription: Stripe.Subscription): void {
  if (subscription.items.has_more) {
    throw new Error(
      `Stripe subscription "${subscription.id}" has more items than fit on ` +
        "one page — refusing to compute MRR from a truncated item list.",
    );
  }
}

// `recurring.interval` is deliberately NOT validated here against Stripe's
// known interval set — see the comment on StripeRecurring["interval"]
// (./types.ts) for why that check belongs in mrr.ts's
// monthlyIntervalDivisor instead, scoped to only the items that actually
// matter for one app's MRR.
function toRecurring(
  recurring: Stripe.Price["recurring"],
): StripeRecurring | null {
  if (!recurring) {
    return null;
  }
  return {
    interval: recurring.interval,
    intervalCount: recurring.interval_count,
  };
}

function toPrice(price: Stripe.Price): StripePrice {
  return {
    id: price.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    product: assertProductId(price.product),
    recurring: toRecurring(price.recurring),
  };
}

function toSubscriptionItem(
  item: Stripe.SubscriptionItem,
): StripeSubscriptionItem {
  return {
    id: item.id,
    quantity: item.quantity ?? null,
    price: toPrice(item.price),
  };
}

/**
 * Translates one real Stripe SDK subscription into this package's plain
 * StripeSubscription shape. The only place that touches `Stripe.*` types —
 * mrr.ts and provider.ts work exclusively in terms of ./types, so they (and
 * their tests) never need the `stripe` package at all.
 */
export function toStripeSubscription(
  subscription: Stripe.Subscription,
): StripeSubscription {
  assertNoTruncatedItems(subscription);
  return {
    id: subscription.id,
    status: subscription.status,
    items: { data: subscription.items.data.map(toSubscriptionItem) },
  };
}
