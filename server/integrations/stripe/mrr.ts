import {
  applyDiscounts,
  applyDiscountsToItems,
  discountAppliesToProduct,
  isDiscountInEffect,
  sumMonthlyDollars,
  type DiscountableItem,
} from "./discounts";
import type {
  StripeDiscount,
  ListActiveSubscriptions,
  StripeRecurring,
  StripeSubscription,
  StripeSubscriptionItem,
  StripeSubscriptionPage,
} from "./types";

// Stripe amounts are in the currency's smallest unit (cents for USD); the
// studio's shared Stripe account bills exclusively in USD today, so this is
// a straight cents -> dollars conversion, not a currency-rate lookup. Rather
// than silently mis-reporting a non-USD price as if it were USD,
// normalizeItemToMonthlyDollars fails loud on anything else (no FX lookup is
// wired up) — see the PR's follow-up suggestions for adding real conversion
// if the account ever prices in more than one currency.
const BILLING_CURRENCY = "usd";
const CENTS_PER_DOLLAR = 100;
const MONTHS_PER_YEAR = 12;
const WEEKS_PER_MONTH = 52 / MONTHS_PER_YEAR;
const DAYS_PER_MONTH = 30;
const MINIMUM_INTERVAL_COUNT = 1;
const MILLISECONDS_PER_SECOND = 1000;

// PRODUCT DECISIONS (issue #73) - flip these to change what MRR means.
// Subscription statuses that count toward MRR and the subscriber count.
// `past_due` is a paying customer in dunning; `trialing` has paid nothing
// yet. Everything else (unpaid, incomplete, paused, canceled, ...) is out.
const MRR_COUNTED_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "past_due",
]);
// When true, MRR reflects discounts/coupons currently in effect; when
// false it is computed from list prices.
const MRR_APPLIES_DISCOUNTS = true;

/**
 * `integration_config.external_id` for a Stripe row is a comma-separated
 * list of product ids (one app can be sold as several tiers/products — see
 * the issue's account model). Returns an empty list for null/blank input so
 * callers can treat "no product ids" as the single unconfigured-app case.
 */
export function parseProductIds(externalId: string | null): string[] {
  if (!externalId) {
    return [];
  }
  return externalId
    .split(",")
    .map((productId) => productId.trim())
    .filter((productId) => productId.length > 0);
}

// How many months one billing cycle spans, so `amountPerCycle / divisor`
// spreads that cycle's revenue evenly across each of its months (e.g. a
// yearly, once-a-year charge spans 12 months, so dividing by 12 gives its
// monthly-equivalent share). This is the only place `interval` is validated
// against Stripe's known set — deliberately deferred here rather than at
// mapping time (see StripeRecurring["interval"]'s comment in ./types.ts) so
// an unrecognized interval fails only the app whose product ids actually
// matched the item carrying it.
function monthlyIntervalDivisor(recurring: StripeRecurring): number {
  const { interval, intervalCount } = recurring;
  if (intervalCount < MINIMUM_INTERVAL_COUNT) {
    throw new Error(
      `Stripe recurring.interval_count must be at least ${MINIMUM_INTERVAL_COUNT}, got ${intervalCount}.`,
    );
  }
  if (interval === "year") {
    return intervalCount * MONTHS_PER_YEAR;
  }
  if (interval === "month") {
    return intervalCount;
  }
  if (interval === "week") {
    return intervalCount / WEEKS_PER_MONTH;
  }
  if (interval === "day") {
    return intervalCount / DAYS_PER_MONTH;
  }
  throw new Error(`Unhandled Stripe recurring interval "${interval}".`);
}

/**
 * One subscription item's contribution to MRR, in dollars.
 *
 * A price with no `recurring` block (a one-time price attached to a
 * subscription item, e.g. a setup fee) legitimately contributes 0 — it
 * isn't recurring revenue. A price with `recurring` set but no `unitAmount`
 * (tiered/graduated/volume pricing, which has no single flat per-unit
 * amount) also contributes 0 today: that's a real, bounded gap — such a
 * subscription's item is silently excluded from MRR rather than computed
 * from its tiers — tracked as a follow-up rather than handled here, since
 * summing tiered pricing needs its own tier-lookup logic. Contributing 0
 * (not throwing) so one oddly-priced item doesn't abort every other app's
 * sync in the same run.
 */
export function normalizeItemToMonthlyDollars(
  item: StripeSubscriptionItem,
): number {
  const { price, quantity } = item;
  if (!price.recurring || price.unitAmount === null) {
    return 0;
  }
  if (price.currency !== BILLING_CURRENCY) {
    throw new Error(
      `Stripe price "${price.id}" is billed in "${price.currency}", ` +
        `but this provider only normalizes "${BILLING_CURRENCY}" amounts ` +
        `(no FX conversion is wired up).`,
    );
  }
  const amountPerCycleDollars =
    (price.unitAmount / CENTS_PER_DOLLAR) * (quantity ?? 1);
  return amountPerCycleDollars / monthlyIntervalDivisor(price.recurring);
}

function roundToCents(value: number): number {
  return Math.round(value * CENTS_PER_DOLLAR) / CENTS_PER_DOLLAR;
}

// Item-level discounts apply to that item's own invoice line, so they use
// the item's own billing cycle.
function normalizeItemNetMonthlyDollars(
  item: StripeSubscriptionItem,
  nowSeconds: number,
): number {
  const grossDollars = normalizeItemToMonthlyDollars(item);
  if (!MRR_APPLIES_DISCOUNTS || grossDollars === 0 || !item.price.recurring) {
    return grossDollars;
  }
  return applyDiscounts(grossDollars, item.price.product, item.discounts, {
    nowSeconds,
    monthlyDivisor: monthlyIntervalDivisor(item.price.recurring),
  });
}

interface TrackedItem extends DiscountableItem {
  matchesApp: boolean;
}

function toTrackedItem(
  item: StripeSubscriptionItem,
  matchesApp: boolean,
  nowSeconds: number,
): TrackedItem {
  return {
    productId: item.price.product,
    monthlyDollars: normalizeItemNetMonthlyDollars(item, nowSeconds),
    matchesApp,
  };
}

function isCoveredByAmountOff(
  item: StripeSubscriptionItem,
  discounts: StripeDiscount[],
  nowSeconds: number,
): boolean {
  return discounts.some(
    (discount) =>
      discount.amountOff !== null &&
      isDiscountInEffect(discount, nowSeconds) &&
      discountAppliesToProduct(discount, item.price.product),
  );
}

// A subscription-level amount_off is split by value across the items it
// covers, including other apps' items; those are only priced (and only risk
// tripping on another app's odd price) when an in-effect amount_off actually
// covers them, so otherwise just the matching items are tracked.
function trackedItemsForSubscription(
  subscription: StripeSubscription,
  matchingItems: StripeSubscriptionItem[],
  nowSeconds: number,
): TrackedItem[] {
  const matchingIds = new Set(matchingItems.map((item) => item.id));
  const shouldTrack = (item: StripeSubscriptionItem): boolean =>
    matchingIds.has(item.id) ||
    (MRR_APPLIES_DISCOUNTS &&
      isCoveredByAmountOff(item, subscription.discounts, nowSeconds));
  return subscription.items.data
    .filter(shouldTrack)
    .map((item) => toTrackedItem(item, matchingIds.has(item.id), nowSeconds));
}

// Stripe requires every item on a subscription to share one billing
// interval, so the first recurring item's cycle is the subscription's.
function subscriptionMonthlyDollars(
  subscription: StripeSubscription,
  matchingItems: StripeSubscriptionItem[],
  nowSeconds: number,
): number {
  const matchingNetDollars = sumMonthlyDollars(
    matchingItems.map((item) => toTrackedItem(item, true, nowSeconds)),
  );
  if (!MRR_APPLIES_DISCOUNTS || matchingNetDollars === 0) {
    return matchingNetDollars;
  }
  const tracked = trackedItemsForSubscription(
    subscription,
    matchingItems,
    nowSeconds,
  );
  const recurring = subscription.items.data.find((item) => item.price.recurring)
    ?.price.recurring;
  const discounted =
    MRR_APPLIES_DISCOUNTS && recurring
      ? applyDiscountsToItems(tracked, subscription.discounts, {
          nowSeconds,
          monthlyDivisor: monthlyIntervalDivisor(recurring),
        })
      : tracked;
  return sumMonthlyDollars(discounted.filter((item) => item.matchesApp));
}

export interface StripeMrrResult {
  mrr: number;
  activeSubscribers: number;
}

/**
 * Sums MRR at the subscription-ITEM level and counts active subscribers,
 * scoped to `productIds`. Only statuses in MRR_COUNTED_STATUSES count, and
 * discounts in effect at `now` reduce MRR (see MRR_APPLIES_DISCOUNTS). A subscription with items across several matching
 * products (a mixed-tier upgrade/downgrade) is summed across only its
 * matching items and counted as exactly one subscriber; a subscription with
 * no matching items is excluded entirely, so an unrelated add-on item never
 * pulls a subscription into another app's numbers.
 *
 * `activeSubscribers` counts matching *subscriptions*, not distinct
 * customers — per the issue's own acceptance criteria ("a mixed-tier
 * subscription is counted once"), the subscription is the unit being
 * counted here. A customer holding two separate subscriptions for the same
 * app (rather than multiple items on one subscription) counts as two; a
 * true distinct-customer count would need `subscription.customer`, which
 * this provider doesn't currently fetch — tracked as a follow-up.
 */
export function computeMrrForProducts(
  subscriptions: StripeSubscription[],
  productIds: Set<string>,
  now: Date = new Date(),
): StripeMrrResult {
  const nowSeconds = Math.floor(now.getTime() / MILLISECONDS_PER_SECOND);
  const matching = subscriptions
    .filter((subscription) => MRR_COUNTED_STATUSES.has(subscription.status))
    .map((subscription) => ({
      subscription,
      items: subscription.items.data.filter((item) =>
        productIds.has(item.price.product),
      ),
    }))
    .filter(({ items }) => items.length > 0);

  const mrr = matching.reduce(
    (sum, { subscription, items }) =>
      sum + subscriptionMonthlyDollars(subscription, items, nowSeconds),
    0,
  );

  return {
    mrr: roundToCents(mrr),
    activeSubscribers: matching.length,
  };
}

// Two ways a misbehaving `listActiveSubscriptions` (a stub, a proxy, a
// Stripe-side bug — never real Stripe under normal operation) could
// otherwise under-report MRR instead of spinning forever: an empty page
// still claiming `hasMore` (silently truncating every subscription past
// that point, whether it's the first page or the fifth), and a non-empty
// page whose cursor doesn't advance (the same page returned twice in a
// row). Both fail loud rather than letting fetchAllActiveSubscriptions
// return a partial, plausible-looking subscription list.
function assertPageAdvanced(
  page: StripeSubscriptionPage,
  lastSubscription: StripeSubscription | undefined,
  previousStartingAfter: string | undefined,
): void {
  if (page.hasMore && !lastSubscription) {
    throw new Error(
      "Stripe subscription pagination returned an empty page while " +
        "still claiming has_more — refusing to silently truncate the list.",
    );
  }
  if (page.hasMore && lastSubscription?.id === previousStartingAfter) {
    throw new Error(
      "Stripe subscription pagination did not advance — " +
        `listActiveSubscriptions returned the same cursor ("${lastSubscription?.id}") twice in a row.`,
    );
  }
}

/**
 * Walks every page of `listActiveSubscriptions`, following Stripe's
 * cursor-pagination convention (next page starts after the last row's id).
 * See assertPageAdvanced for the two failure modes guarded against.
 */
export async function fetchAllActiveSubscriptions(
  listActiveSubscriptions: ListActiveSubscriptions,
): Promise<StripeSubscription[]> {
  const allSubscriptions: StripeSubscription[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const previousStartingAfter = startingAfter;
    const page = await listActiveSubscriptions(startingAfter);
    const lastSubscription = page.data.at(-1);
    assertPageAdvanced(page, lastSubscription, previousStartingAfter);

    allSubscriptions.push(...page.data);
    startingAfter = lastSubscription?.id;
    hasMore = page.hasMore;
  }

  return allSubscriptions;
}
