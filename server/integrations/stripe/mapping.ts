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

// Stripe's SDK types `recurring.interval` as `'day' | 'month' | 'week' |
// 'year' | OtherString` — a forward-compatibility catch-all for values the
// SDK doesn't know about yet — so it isn't statically assignable to this
// package's narrower StripeRecurring["interval"]. Validated the same way as
// assertProductId: fail loud rather than silently mis-normalizing MRR for an
// interval this provider has no monthly-equivalent formula for.
const KNOWN_RECURRING_INTERVALS: ReadonlySet<StripeRecurring["interval"]> =
  new Set(["day", "week", "month", "year"]);

function assertKnownInterval(interval: string): StripeRecurring["interval"] {
  if (!KNOWN_RECURRING_INTERVALS.has(interval as StripeRecurring["interval"])) {
    throw new Error(`Unrecognized Stripe recurring interval "${interval}".`);
  }
  return interval as StripeRecurring["interval"];
}

function toRecurring(
  recurring: Stripe.Price["recurring"],
): StripeRecurring | null {
  if (!recurring) {
    return null;
  }
  return {
    interval: assertKnownInterval(recurring.interval),
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
  return {
    id: subscription.id,
    status: subscription.status,
    items: { data: subscription.items.data.map(toSubscriptionItem) },
  };
}
