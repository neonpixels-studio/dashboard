import type {
  ListActiveSubscriptions,
  StripeRecurring,
  StripeSubscription,
  StripeSubscriptionItem,
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

// How many months one billing cycle spans, so `amountPerCycle / divisor`
// spreads that cycle's revenue evenly across each of its months (e.g. a
// yearly, once-a-year charge spans 12 months, so dividing by 12 gives its
// monthly-equivalent share). Exhaustive over StripeRecurring["interval"]
// with an explicit throw rather than a silent fallthrough — mapping.ts's
// assertKnownInterval already guards real Stripe responses, but this
// function is also called directly from provider/test code against
// hand-built or fixture data that bypasses that guard, so it needs its own
// defense against an interval it has no formula for.
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
 * Guards against two ways a misbehaving `listActiveSubscriptions` (a stub,
 * a proxy, a Stripe-side bug — never real Stripe under normal operation)
 * could otherwise under-report MRR instead of spinning forever: an empty
 * page still claiming `hasMore` (silently truncating every subscription
 * past that point, whether it's the first page or the fifth), and a
 * non-empty page whose cursor doesn't advance (the same page returned twice
 * in a row). Both fail loud rather than returning a partial, plausible-
 * looking subscription list.
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

    if (page.hasMore && !lastSubscription) {
      throw new Error(
        "Stripe subscription pagination returned an empty page while " +
          "still claiming has_more — refusing to silently truncate the list.",
      );
    }
    if (
      page.hasMore &&
      lastSubscription &&
      lastSubscription.id === previousStartingAfter
    ) {
      throw new Error(
        "Stripe subscription pagination did not advance — " +
          `listActiveSubscriptions returned the same cursor ("${lastSubscription.id}") twice in a row.`,
      );
    }

    allSubscriptions.push(...page.data);
    startingAfter = lastSubscription?.id;
    hasMore = page.hasMore;
  }

  return allSubscriptions;
}
