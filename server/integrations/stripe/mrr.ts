import type {
  ListActiveSubscriptions,
  StripeRecurring,
  StripeSubscription,
  StripeSubscriptionItem,
} from "./types";

// Stripe amounts are in the currency's smallest unit (cents for USD); the
// studio's shared Stripe account bills exclusively in USD today, so this is
// a straight cents -> dollars conversion, not a currency-rate lookup. A
// non-USD price would silently be treated as USD — tracked as a follow-up,
// not handled here (see the PR's follow-up suggestions).
const CENTS_PER_DOLLAR = 100;
const MONTHS_PER_YEAR = 12;
const WEEKS_PER_MONTH = 52 / MONTHS_PER_YEAR;
const DAYS_PER_MONTH = 30;
// Stripe's default page size for list endpoints; also this provider's
// explicit `limit` (stripeClient.ts), so pagination behavior doesn't depend
// on Stripe's implicit default changing.
export const SUBSCRIPTIONS_PAGE_SIZE = 100;

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

// How many billing cycles fit in one month, so `amountPerCycle / divisor`
// normalizes any interval to a monthly-equivalent amount. Week/day are
// handled for completeness (Stripe allows them), even though the issue only
// requires yearly->monthly to be unit-tested.
function monthlyIntervalDivisor(recurring: StripeRecurring): number {
  const { interval, intervalCount } = recurring;
  if (interval === "year") {
    return intervalCount * MONTHS_PER_YEAR;
  }
  if (interval === "month") {
    return intervalCount;
  }
  if (interval === "week") {
    return intervalCount / WEEKS_PER_MONTH;
  }
  return intervalCount / DAYS_PER_MONTH;
}

/**
 * One subscription item's contribution to MRR, in dollars. A price with no
 * `unitAmount` (e.g. tiered/graduated pricing with no flat per-unit amount)
 * or no `recurring` block (a one-time price attached to a subscription item)
 * contributes 0 rather than throwing — summing across many subscriptions
 * shouldn't abort on one item shaped differently than expected.
 */
export function normalizeItemToMonthlyDollars(
  item: StripeSubscriptionItem,
): number {
  const { price, quantity } = item;
  if (price.unitAmount === null || !price.recurring) {
    return 0;
  }
  const amountPerCycleDollars =
    (price.unitAmount / CENTS_PER_DOLLAR) * (quantity ?? 1);
  return amountPerCycleDollars / monthlyIntervalDivisor(price.recurring);
}

function roundToCents(value: number): number {
  return Math.round(value * CENTS_PER_DOLLAR) / CENTS_PER_DOLLAR;
}

function sumMonthlyDollars(items: StripeSubscriptionItem[]): number {
  return items.reduce(
    (sum, item) => sum + normalizeItemToMonthlyDollars(item),
    0,
  );
}

export interface StripeMrrResult {
  mrr: number;
  activeSubscribers: number;
}

/**
 * Sums MRR at the subscription-ITEM level and counts active subscribers,
 * scoped to `productIds`. A subscription with items across several matching
 * products (a mixed-tier upgrade/downgrade) is summed across only its
 * matching items and counted as exactly one subscriber; a subscription with
 * no matching items is excluded entirely, so an unrelated add-on item never
 * pulls a subscription into another app's numbers.
 */
export function computeMrrForProducts(
  subscriptions: StripeSubscription[],
  productIds: Set<string>,
): StripeMrrResult {
  const matchedSubscriptions = subscriptions
    .map((subscription) => ({
      subscription,
      matchingItems: subscription.items.data.filter((item) =>
        productIds.has(item.price.product),
      ),
    }))
    .filter((entry) => entry.matchingItems.length > 0);

  const mrr = matchedSubscriptions.reduce(
    (sum, entry) => sum + sumMonthlyDollars(entry.matchingItems),
    0,
  );

  return {
    mrr: roundToCents(mrr),
    activeSubscribers: matchedSubscriptions.length,
  };
}

/**
 * Walks every page of `listActiveSubscriptions`, following Stripe's
 * cursor-pagination convention (next page starts after the last row's id).
 * Guards against an empty page still claiming `hasMore` — that would
 * otherwise spin forever re-requesting the same cursor.
 */
export async function fetchAllActiveSubscriptions(
  listActiveSubscriptions: ListActiveSubscriptions,
): Promise<StripeSubscription[]> {
  const allSubscriptions: StripeSubscription[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await listActiveSubscriptions(startingAfter);
    allSubscriptions.push(...page.data);
    const lastSubscription = page.data.at(-1);
    hasMore = page.hasMore && lastSubscription !== undefined;
    startingAfter = lastSubscription?.id;
  }

  return allSubscriptions;
}
