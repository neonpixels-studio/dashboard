import type { StripeDiscount } from "./types";

const CENTS_PER_DOLLAR = 100;
const PERCENT_DIVISOR = 100;
const BILLING_CURRENCY = "usd";
const ONE_TIME_DISCOUNT_DURATION = "once";

/**
 * A recurring discount is in effect from `start` until `end` (exclusive); a null
 * `end` never expires. Times are unix seconds, like Stripe's.
 */
function isDiscountInEffect(
  discount: StripeDiscount,
  nowSeconds: number,
): boolean {
  if (discount.duration === ONE_TIME_DISCOUNT_DURATION) {
    return false;
  }
  if (discount.start > nowSeconds) {
    return false;
  }
  return discount.end === null || discount.end > nowSeconds;
}

export function hasAmountOffDiscount(
  discounts: StripeDiscount[],
  nowSeconds: number,
): boolean {
  return discounts.some(
    (discount) =>
      isDiscountInEffect(discount, nowSeconds) && discount.amountOff !== null,
  );
}

function assertUsdAmountOff(discount: StripeDiscount): void {
  if (discount.currency === BILLING_CURRENCY) {
    return;
  }
  throw new Error(
    `Stripe amount_off discount is in "${discount.currency}", ` +
      `but this provider only normalizes "${BILLING_CURRENCY}" amounts.`,
  );
}

export interface DiscountContext {
  nowSeconds: number;
  // Months spanned by one billing cycle; an amount_off discount comes off
  // each invoice, so it's spread over this many months to get a monthly cut.
  monthlyDivisor: number;
}

export interface DiscountableItem {
  productId: string;
  monthlyDollars: number;
}

// A coupon with no `applies_to` covers every item; otherwise only items whose
// product is on its list.
function discountAppliesToProduct(
  discount: StripeDiscount,
  productId: string,
): boolean {
  return (
    discount.appliesToProducts === null ||
    discount.appliesToProducts.includes(productId)
  );
}

function sumMonthlyDollars(items: DiscountableItem[]): number {
  return items.reduce((sum, item) => sum + item.monthlyDollars, 0);
}

function applyPercentOff<Item extends DiscountableItem>(
  items: Item[],
  discount: StripeDiscount,
  percentOff: number,
): Item[] {
  return items.map((item) => {
    if (!discountAppliesToProduct(discount, item.productId)) {
      return item;
    }
    return {
      ...item,
      monthlyDollars: item.monthlyDollars * (1 - percentOff / PERCENT_DIVISOR),
    };
  });
}

// An amount_off comes off the invoice once, so it is shared out across the
// eligible items in proportion to their value.
function applyAmountOff<Item extends DiscountableItem>(
  items: Item[],
  discount: StripeDiscount,
  amountOff: number,
  context: DiscountContext,
): Item[] {
  assertUsdAmountOff(discount);
  const eligibleTotal = sumMonthlyDollars(
    items.filter((item) => discountAppliesToProduct(discount, item.productId)),
  );
  if (eligibleTotal <= 0) {
    return items;
  }
  const monthlyCut = amountOff / CENTS_PER_DOLLAR / context.monthlyDivisor;
  return items.map((item) => {
    if (!discountAppliesToProduct(discount, item.productId)) {
      return item;
    }
    const itemCut = monthlyCut * (item.monthlyDollars / eligibleTotal);
    return {
      ...item,
      monthlyDollars: Math.max(item.monthlyDollars - itemCut, 0),
    };
  });
}

function applyOneDiscount<Item extends DiscountableItem>(
  items: Item[],
  discount: StripeDiscount,
  context: DiscountContext,
): Item[] {
  if (discount.percentOff !== null) {
    return applyPercentOff(items, discount, discount.percentOff);
  }
  if (discount.amountOff === null) {
    return items;
  }
  return applyAmountOff(items, discount, discount.amountOff, context);
}

/**
 * Reduces each item's monthly dollar value by every discount currently in
 * effect, in order (Stripe applies them sequentially), never going below
 * zero. A discount restricted to certain products leaves other items alone.
 */
export function applyDiscountsToItems<Item extends DiscountableItem>(
  items: Item[],
  discounts: StripeDiscount[],
  context: DiscountContext,
): Item[] {
  return discounts
    .filter((discount) => isDiscountInEffect(discount, context.nowSeconds))
    .reduce(
      (current, discount) => applyOneDiscount(current, discount, context),
      items,
    );
}

/** Single-item convenience over `applyDiscountsToItems`. */
export function applyDiscounts(
  monthlyDollars: number,
  productId: string,
  discounts: StripeDiscount[],
  context: DiscountContext,
): number {
  const [discounted] = applyDiscountsToItems(
    [{ productId, monthlyDollars }],
    discounts,
    context,
  );
  return Math.max(discounted?.monthlyDollars ?? monthlyDollars, 0);
}
