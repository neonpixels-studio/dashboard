import type { StripeDiscount } from "./types";

const CENTS_PER_DOLLAR = 100;
const PERCENT_DIVISOR = 100;
const BILLING_CURRENCY = "usd";

/**
 * A discount is in effect from `start` until `end` (exclusive); a null
 * `end` never expires. Times are unix seconds, like Stripe's.
 */
function isDiscountInEffect(
  discount: StripeDiscount,
  nowSeconds: number,
): boolean {
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
  // Fraction of the discount attributable to the value being reduced (a
  // subscription-level amount_off is shared across all of its items, but
  // only some may belong to the app being computed).
  share?: number;
}

function applyOneDiscount(
  monthlyDollars: number,
  discount: StripeDiscount,
  context: DiscountContext,
): number {
  if (discount.percentOff !== null) {
    return monthlyDollars * (1 - discount.percentOff / PERCENT_DIVISOR);
  }
  if (discount.amountOff === null) {
    return monthlyDollars;
  }
  assertUsdAmountOff(discount);
  const monthlyCut =
    (discount.amountOff / CENTS_PER_DOLLAR / context.monthlyDivisor) *
    (context.share ?? 1);
  return monthlyDollars - monthlyCut;
}

/**
 * Reduces a monthly dollar value by every discount currently in effect, in
 * order (Stripe applies them sequentially), never going below zero.
 */
export function applyDiscounts(
  monthlyDollars: number,
  discounts: StripeDiscount[],
  context: DiscountContext,
): number {
  const reduced = discounts
    .filter((discount) => isDiscountInEffect(discount, context.nowSeconds))
    .reduce(
      (value, discount) => applyOneDiscount(value, discount, context),
      monthlyDollars,
    );
  return Math.max(reduced, 0);
}
