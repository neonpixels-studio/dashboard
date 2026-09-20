import { describe, expect, it, vi } from "vitest";
import {
  computeMrrForProducts,
  fetchAllActiveSubscriptions,
  normalizeItemToMonthlyDollars,
  parseProductIds,
} from "../../../../server/integrations/stripe/mrr";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type {
  StripeSubscription,
  StripeSubscriptionItem,
  StripeSubscriptionPage,
} from "../../../../server/integrations/stripe/types";

function buildItem(
  overrides: Partial<StripeSubscriptionItem> = {},
): StripeSubscriptionItem {
  return {
    id: "si_test",
    quantity: 1,
    price: {
      id: "price_test",
      unitAmount: 1000,
      currency: "usd",
      product: "prod_test",
      recurring: { interval: "month", intervalCount: 1 },
    },
    ...overrides,
  };
}

describe("parseProductIds", () => {
  it("returns an empty list for null", () => {
    expect(parseProductIds(null)).toEqual([]);
  });

  it("returns an empty list for a blank string", () => {
    expect(parseProductIds("   ")).toEqual([]);
  });

  it("splits, trims, and drops empty entries from a comma-separated list", () => {
    expect(parseProductIds(" prod_a, prod_b ,,prod_c")).toEqual([
      "prod_a",
      "prod_b",
      "prod_c",
    ]);
  });

  it("returns a single-element list for one product id", () => {
    expect(parseProductIds("prod_solo")).toEqual(["prod_solo"]);
  });
});

describe("normalizeItemToMonthlyDollars", () => {
  it("converts cents to dollars for a monthly price (currency normalization)", () => {
    const item = buildItem({
      price: {
        id: "price_monthly",
        unitAmount: 900,
        currency: "usd",
        product: "prod_test",
        recurring: { interval: "month", intervalCount: 1 },
      },
    });

    expect(normalizeItemToMonthlyDollars(item)).toBe(9);
  });

  it("normalizes a yearly price down to its monthly equivalent", () => {
    const item = buildItem({
      price: {
        id: "price_yearly",
        unitAmount: 12000,
        currency: "usd",
        product: "prod_test",
        recurring: { interval: "year", intervalCount: 1 },
      },
    });

    expect(normalizeItemToMonthlyDollars(item)).toBe(10);
  });

  it("divides a multi-year interval (e.g. a 2-year plan) by the full month count", () => {
    const item = buildItem({
      price: {
        id: "price_biennial",
        unitAmount: 24000,
        currency: "usd",
        product: "prod_test",
        recurring: { interval: "year", intervalCount: 2 },
      },
    });

    expect(normalizeItemToMonthlyDollars(item)).toBe(10);
  });

  it("multiplies by quantity", () => {
    const item = buildItem({ quantity: 3 });

    expect(normalizeItemToMonthlyDollars(item)).toBe(30);
  });

  it("treats a missing quantity as 1", () => {
    const item = buildItem({ quantity: null });

    expect(normalizeItemToMonthlyDollars(item)).toBe(10);
  });

  it("returns 0 for a price with no flat unit amount (e.g. tiered pricing)", () => {
    const item = buildItem({
      price: {
        id: "price_tiered",
        unitAmount: null,
        currency: "usd",
        product: "prod_test",
        recurring: { interval: "month", intervalCount: 1 },
      },
    });

    expect(normalizeItemToMonthlyDollars(item)).toBe(0);
  });

  it("returns 0 for a non-recurring price", () => {
    const item = buildItem({
      price: {
        id: "price_one_time",
        unitAmount: 1000,
        currency: "usd",
        product: "prod_test",
        recurring: null,
      },
    });

    expect(normalizeItemToMonthlyDollars(item)).toBe(0);
  });
});

describe("computeMrrForProducts (fixture: mixed-tier-active-subscriptions)", () => {
  it("sums matching items across tiers, excludes non-matching subscriptions/items, and counts a mixed-tier subscription once", async () => {
    const fixture = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "mixed-tier-active-subscriptions",
    );
    const basinProductIds = new Set(["prod_basin_core", "prod_basin_pro"]);

    const result = computeMrrForProducts(fixture.data, basinProductIds);

    // sub_mixed_tier: $9 (monthly) + $120/12 (yearly) = $19
    // sub_other_app_only: excluded entirely (no matching items)
    // sub_basin_plus_unrelated_addon: $9 x 2 qty = $18 (the $3 addon item is
    // a different product and is excluded from the sum)
    expect(result.mrr).toBe(37);
    // sub_mixed_tier + sub_basin_plus_unrelated_addon, each counted once
    // despite sub_mixed_tier having two matching items.
    expect(result.activeSubscribers).toBe(2);
  });

  it("scopes strictly to the given product set — a different app's product ids see none of these subscriptions", async () => {
    const fixture = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "mixed-tier-active-subscriptions",
    );

    const result = computeMrrForProducts(
      fixture.data,
      new Set(["prod_wanderist_core"]),
    );

    expect(result).toEqual({ mrr: 0, activeSubscribers: 0 });
  });

  it("returns a real zero (not an omission) when the product is configured but has no active subscribers", async () => {
    const fixture = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "no-active-subscriptions",
    );

    const result = computeMrrForProducts(
      fixture.data,
      new Set(["prod_basin_core"]),
    );

    expect(result).toEqual({ mrr: 0, activeSubscribers: 0 });
  });
});

function fakeListFromPages(
  pages: Record<string, StripeSubscriptionPage>,
): (startingAfter?: string) => Promise<StripeSubscriptionPage> {
  return vi.fn(async (startingAfter?: string) => {
    const key = startingAfter ?? "first";
    const page = pages[key];
    if (!page) {
      throw new Error(`No fixture page registered for cursor "${key}"`);
    }
    return page;
  });
}

describe("fetchAllActiveSubscriptions", () => {
  it("follows Stripe's cursor pagination across pages, using the previous page's last subscription id", async () => {
    const pageOne = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "paginated-page-1",
    );
    const pageTwo = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "paginated-page-2",
    );
    const listActiveSubscriptions = fakeListFromPages({
      first: pageOne,
      sub_page1: pageTwo,
    });

    const subscriptions = await fetchAllActiveSubscriptions(
      listActiveSubscriptions,
    );

    expect(subscriptions.map((subscription) => subscription.id)).toEqual([
      "sub_page1",
      "sub_page2",
    ]);
    expect(listActiveSubscriptions).toHaveBeenCalledTimes(2);
    expect(listActiveSubscriptions).toHaveBeenNthCalledWith(1, undefined);
    expect(listActiveSubscriptions).toHaveBeenNthCalledWith(2, "sub_page1");
  });

  it("stops after a single page when hasMore is false", async () => {
    const singlePage: StripeSubscriptionPage = {
      data: [
        {
          id: "sub_only",
          status: "active",
          items: { data: [] },
        },
      ],
      hasMore: false,
    };
    const listActiveSubscriptions = fakeListFromPages({ first: singlePage });

    const subscriptions = await fetchAllActiveSubscriptions(
      listActiveSubscriptions,
    );

    expect(subscriptions).toHaveLength(1);
    expect(listActiveSubscriptions).toHaveBeenCalledTimes(1);
  });

  it("does not loop forever if an empty page claims hasMore", async () => {
    const emptyPage: StripeSubscriptionPage = { data: [], hasMore: true };
    const listActiveSubscriptions = fakeListFromPages({ first: emptyPage });

    const subscriptions: StripeSubscription[] =
      await fetchAllActiveSubscriptions(listActiveSubscriptions);

    expect(subscriptions).toEqual([]);
    expect(listActiveSubscriptions).toHaveBeenCalledTimes(1);
  });
});
