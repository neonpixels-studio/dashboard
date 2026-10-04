import { describe, expect, it } from "vitest";
import { applyDiscountsToItems } from "../../../../server/integrations/stripe/discounts";
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
});
