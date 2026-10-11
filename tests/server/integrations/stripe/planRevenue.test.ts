import { describe, expect, it } from "vitest";
import { computePlanRevenue } from "../../../../server/integrations/stripe/planRevenue";
import { computeMrrForProducts } from "../../../../server/integrations/stripe/mrr";
import type {
  StripeDiscount,
  StripeSubscription,
} from "../../../../server/integrations/stripe/types";

const NOW = new Date("2026-09-20T00:00:00Z");

function subscription(
  id: string,
  items: Array<{ product: string; unitAmount: number; interval?: string }>,
  overrides: Partial<StripeSubscription> = {},
): StripeSubscription {
  return {
    id,
    status: "active",
    discounts: [],
    items: {
      data: items.map((item, index) => ({
        id: `si_${id}_${index}`,
        quantity: 1,
        discounts: [],
        price: {
          id: `price_${item.product}`,
          unitAmount: item.unitAmount,
          currency: "usd",
          product: item.product,
          recurring: { interval: item.interval ?? "month", intervalCount: 1 },
        },
      })),
    },
    ...overrides,
  };
}

const PLAN_NAMES = new Map([
  ["prod_pro", "Pro"],
  ["prod_supporter", "Supporter"],
]);
const PRODUCT_IDS = new Set(["prod_pro", "prod_supporter"]);

describe("computePlanRevenue", () => {
  it("returns an empty list, never zero-valued plans, when there are no subscriptions", () => {
    expect(computePlanRevenue([], PRODUCT_IDS, PLAN_NAMES, NOW)).toEqual([]);
  });

  it("sums monthly revenue and subscriber count per product, highest revenue first", () => {
    const plans = computePlanRevenue(
      [
        subscription("sub_1", [{ product: "prod_supporter", unitAmount: 200 }]),
        subscription("sub_2", [{ product: "prod_pro", unitAmount: 400 }]),
        subscription("sub_3", [{ product: "prod_pro", unitAmount: 400 }]),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      NOW,
    );

    expect(plans).toEqual([
      {
        productId: "prod_pro",
        planName: "Pro",
        monthlyRevenue: 8,
        subscribers: 2,
      },
      {
        productId: "prod_supporter",
        planName: "Supporter",
        monthlyRevenue: 2,
        subscribers: 1,
      },
    ]);
  });

  it("normalizes a yearly price to its monthly equivalent", () => {
    const [plan] = computePlanRevenue(
      [
        subscription("sub_1", [
          { product: "prod_pro", unitAmount: 12000, interval: "year" },
        ]),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      NOW,
    );

    expect(plan?.monthlyRevenue).toBe(10);
  });

  it("ignores other apps' products and uncounted statuses", () => {
    const plans = computePlanRevenue(
      [
        subscription("sub_other", [
          { product: "prod_other_app", unitAmount: 900 },
        ]),
        subscription("sub_trial", [{ product: "prod_pro", unitAmount: 400 }], {
          status: "trialing",
        }),
      ],
      PRODUCT_IDS,
      PLAN_NAMES,
      NOW,
    );

    expect(plans).toEqual([]);
  });

  it("falls back to the product id when no plan name is known", () => {
    const [plan] = computePlanRevenue(
      [subscription("sub_1", [{ product: "prod_pro", unitAmount: 400 }])],
      PRODUCT_IDS,
      new Map(),
      NOW,
    );

    expect(plan?.planName).toBe("prod_pro");
  });

  it("splits a mixed-tier subscription's discounted total across its plans so plans still sum to MRR", () => {
    const halfOff: StripeDiscount = {
      percentOff: 50,
      amountOff: null,
      currency: null,
      duration: "forever",
      start: 0,
      end: null,
      appliesToProducts: null,
    };
    const subscriptions = [
      subscription(
        "sub_1",
        [
          { product: "prod_pro", unitAmount: 600 },
          { product: "prod_supporter", unitAmount: 200 },
        ],
        { discounts: [halfOff] },
      ),
    ];

    const plans = computePlanRevenue(
      subscriptions,
      PRODUCT_IDS,
      PLAN_NAMES,
      NOW,
    );
    const { mrr } = computeMrrForProducts(subscriptions, PRODUCT_IDS, NOW);

    expect(plans.map((plan) => plan.monthlyRevenue)).toEqual([3, 1]);
    expect(plans.reduce((sum, plan) => sum + plan.monthlyRevenue, 0)).toBe(mrr);
    expect(plans.map((plan) => plan.subscribers)).toEqual([1, 1]);
  });
});
