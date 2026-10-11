import {
  MILLISECONDS_PER_SECOND,
  matchSubscriptionsToProducts,
  normalizeItemToMonthlyDollars,
  roundToCents,
  subscriptionMonthlyDollars,
} from "./mrr";
import type { StripePlanRevenueInput } from "../types";
import type { StripeSubscription, StripeSubscriptionItem } from "./types";

interface PlanTotals {
  monthlyRevenue: number;
  subscribers: number;
}

// A subscription's discounted monthly total (the number MRR sums) split
// across its matching items by each item's share of the gross list price, so
// every plan's figure is discount-aware and the plans still add up to MRR.
function itemShares(
  subscription: StripeSubscription,
  items: StripeSubscriptionItem[],
  nowSeconds: number,
): Map<string, number> {
  const netDollars = subscriptionMonthlyDollars(
    subscription,
    items,
    nowSeconds,
  );
  const grossByItem = items.map((item) => normalizeItemToMonthlyDollars(item));
  const grossTotal = grossByItem.reduce((sum, gross) => sum + gross, 0);
  const sharesByProduct = new Map<string, number>();
  items.forEach((item, index) => {
    const share =
      grossTotal === 0 ? 0 : netDollars * (grossByItem[index]! / grossTotal);
    const productId = item.price.product;
    sharesByProduct.set(
      productId,
      (sharesByProduct.get(productId) ?? 0) + share,
    );
  });
  return sharesByProduct;
}

function addToPlans(
  totalsByProduct: Map<string, PlanTotals>,
  sharesByProduct: Map<string, number>,
): void {
  for (const [productId, share] of sharesByProduct) {
    const totals = totalsByProduct.get(productId) ?? {
      monthlyRevenue: 0,
      subscribers: 0,
    };
    totals.monthlyRevenue += share;
    totals.subscribers += 1;
    totalsByProduct.set(productId, totals);
  }
}

/**
 * Current MRR split by product for one app, highest revenue first. Counts the
 * same subscriptions as computeMrrForProducts. A product with no counted
 * subscription gets no row, so an app with none returns an empty list rather
 * than zero-valued plans.
 */
export function computePlanRevenue(
  subscriptions: StripeSubscription[],
  productIds: Set<string>,
  planNames: Map<string, string>,
  now: Date = new Date(),
): StripePlanRevenueInput[] {
  const nowSeconds = Math.floor(now.getTime() / MILLISECONDS_PER_SECOND);
  const totalsByProduct = new Map<string, PlanTotals>();
  for (const { subscription, items } of matchSubscriptionsToProducts(
    subscriptions,
    productIds,
  )) {
    addToPlans(totalsByProduct, itemShares(subscription, items, nowSeconds));
  }
  return [...totalsByProduct]
    .map(([productId, totals]) => ({
      productId,
      planName: planNames.get(productId) ?? productId,
      monthlyRevenue: roundToCents(totals.monthlyRevenue),
      subscribers: totals.subscribers,
    }))
    .sort((left, right) => right.monthlyRevenue - left.monthlyRevenue);
}
