import { describe, expect, it } from "vitest";
import {
  applyDiscounts,
  applyDiscountsToItems,
} from "../../../../server/integrations/stripe/discounts";
import type { StripeDiscount } from "../../../../server/integrations/stripe/types";

const NOW_SECONDS = 1_000_000;
const CONTEXT = { nowSeconds: NOW_SECONDS, monthlyDivisor: 1 };

function buildDiscount(overrides: Partial<StripeDiscount>): StripeDiscount {
  return {
    percentOff: null,
    amountOff: null,
    currency: null,
    duration: "forever",
    start: NOW_SECONDS - 1,
    end: null,
    appliesToProducts: null,
    ...overrides,
  };
}

describe("applyDiscountsToItems", () => {
  it("returns items unchanged for an amount_off restricted to a product none of them have", () => {
    const items = [{ productId: "prod_a", monthlyDollars: 10 }];
    const discount = buildDiscount({
      amountOff: 400,
      currency: "usd",
      appliesToProducts: ["prod_z"],
    });

    expect(applyDiscountsToItems(items, [discount], CONTEXT)).toEqual(items);
  });

  it("applies a percent discount only to items on its applies_to list", () => {
    const items = [
      { productId: "prod_a", monthlyDollars: 10 },
      { productId: "prod_b", monthlyDollars: 10 },
    ];
    const discount = buildDiscount({
      percentOff: 50,
      appliesToProducts: ["prod_a"],
    });

    expect(
      applyDiscountsToItems(items, [discount], CONTEXT).map(
        (item) => item.monthlyDollars,
      ),
    ).toEqual([5, 10]);
  });

  it("splits an unrestricted amount_off in proportion to item value", () => {
    const items = [
      { productId: "prod_a", monthlyDollars: 10 },
      { productId: "prod_b", monthlyDollars: 5 },
    ];
    const discount = buildDiscount({ amountOff: 300, currency: "usd" });

    expect(
      applyDiscountsToItems(items, [discount], CONTEXT).map(
        (item) => item.monthlyDollars,
      ),
    ).toEqual([8, 4]);
  });

  it("never takes an item below zero", () => {
    const items = [
      { productId: "prod_a", monthlyDollars: 1 },
      { productId: "prod_b", monthlyDollars: 1 },
    ];
    const discount = buildDiscount({ amountOff: 10_000, currency: "usd" });

    expect(
      applyDiscountsToItems(items, [discount], CONTEXT).map(
        (item) => item.monthlyDollars,
      ),
    ).toEqual([0, 0]);
  });

  it("applies discounts sequentially, so order matters", () => {
    const items = [{ productId: "prod_a", monthlyDollars: 10 }];
    const percent = buildDiscount({ percentOff: 50 });
    const amount = buildDiscount({ amountOff: 200, currency: "usd" });

    expect(
      applyDiscountsToItems(items, [percent, amount], CONTEXT)[0]
        ?.monthlyDollars,
    ).toBe(3);
    expect(
      applyDiscountsToItems(items, [amount, percent], CONTEXT)[0]
        ?.monthlyDollars,
    ).toBe(4);
  });

  it("applyDiscounts ignores a coupon restricted to a different product", () => {
    const discount = buildDiscount({
      percentOff: 50,
      appliesToProducts: ["prod_z"],
    });

    expect(applyDiscounts(10, "prod_a", [discount], CONTEXT)).toBe(10);
  });
});
