import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStripeMetrics,
  stripeProvider,
} from "../../../../server/integrations/stripe/provider";
import { createExhaustedDeadline } from "../../../../server/integrations/testing/deadlineFixtures";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type { StripeSubscriptionPage } from "../../../../server/integrations/stripe/types";

// Only stripeProvider.fetch's own two-line wiring (guard + delegate to
// fetchStripeMetrics) needs the real "stripe" package mocked — every other
// test in this file exercises fetchStripeMetrics directly with an injected
// ListActiveSubscriptions fake and never touches the module.
const { mockSubscriptionsList, mockEventsList, mockProductsRetrieve } =
  vi.hoisted(() => ({
    mockSubscriptionsList: vi.fn(),
    mockEventsList: vi.fn(),
    mockProductsRetrieve: vi.fn(),
  }));
const { mockReportError } = vi.hoisted(() => ({ mockReportError: vi.fn() }));
vi.mock("../../../../server/utils/errorReporting", () => ({
  reportError: mockReportError,
}));
vi.mock("stripe", () => ({
  default: class MockStripe {
    static API_VERSION = "mock-api-version";
    subscriptions = { list: mockSubscriptionsList };
    events = { list: mockEventsList };
    products = { retrieve: mockProductsRetrieve };
    customers = { retrieve: vi.fn() };
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  mockSubscriptionsList.mockReset();
  mockEventsList.mockReset();
  mockProductsRetrieve.mockReset();
  mockReportError.mockReset();
});

describe("stripeProvider", () => {
  it("identifies itself as the stripe vendor", () => {
    expect(stripeProvider.vendor).toBe("stripe");
  });

  it("throws when the config has no secret key", async () => {
    const config = createTestIntegrationConfig({
      vendor: "stripe",
      externalId: "prod_basin_core",
      secret: null,
    });

    await expect(stripeProvider.fetch(config)).rejects.toThrow(
      /no secret key configured/,
    );
    expect(mockSubscriptionsList).not.toHaveBeenCalled();
  });

  it("end-to-end: builds a real Stripe client from config.secret and returns its computed metrics", async () => {
    mockEventsList.mockResolvedValue({ data: [], has_more: false });
    mockProductsRetrieve.mockResolvedValue({ deleted: false, name: "Core" });
    mockSubscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_e2e",
          status: "active",
          items: {
            data: [
              {
                id: "si_e2e",
                quantity: 1,
                discounts: [],
                price: {
                  id: "price_e2e",
                  unit_amount: 1500,
                  currency: "usd",
                  product: "prod_basin_core",
                  recurring: { interval: "month", interval_count: 1 },
                },
              },
            ],
            has_more: false,
          },
          discounts: [],
        },
      ],
      has_more: false,
    });
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "stripe",
      externalId: "prod_basin_core",
      secret: "sk_test_e2e",
    });

    const result = await stripeProvider.fetch(config);

    expect(mockSubscriptionsList).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        expand: ["data.discounts", "data.items.data.discounts"],
      }),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    const mrrMetric = result.metrics.find((metric) => metric.metric === "mrr");
    expect(mrrMetric?.value).toBe(15);
    expect(result.stripeDetail).toEqual({
      planRevenue: [
        {
          productId: "prod_basin_core",
          planName: "Core",
          monthlyRevenue: 15,
          subscribers: 1,
        },
      ],
      events: [],
    });
  });

  it("threads a passed-in deadline through to the real Stripe client (issue #62), rather than silently ignoring it", async () => {
    // Proves the wiring, not just createStripeSubscriptionLister's own
    // behavior in isolation (see stripeClient.test.ts): if
    // stripeProvider.fetch ever dropped its `deadline` argument on the way
    // to createStripeSubscriptionLister, this exhausted deadline would be
    // ignored and mockSubscriptionsList would still resolve normally
    // instead of this rejecting.
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "stripe",
      externalId: "prod_basin_core",
      secret: "sk_test_e2e",
    });
    await expect(
      stripeProvider.fetch(config, createExhaustedDeadline()),
    ).rejects.toThrow(/shared run budget was already exhausted/);
    expect(mockSubscriptionsList).not.toHaveBeenCalled();
  });
});

describe("fetchStripeMetrics", () => {
  it("returns no rows (not zeros) for an unconfigured app, without calling Stripe at all", async () => {
    const config = createTestIntegrationConfig({
      vendor: "stripe",
      externalId: null,
      secret: "sk_test_unused",
    });
    const listActiveSubscriptions = vi.fn();

    const result = await fetchStripeMetrics(config, listActiveSubscriptions);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(listActiveSubscriptions).not.toHaveBeenCalled();
  });

  it("returns no rows for a blank product-id string, same as null", async () => {
    const config = createTestIntegrationConfig({
      vendor: "stripe",
      externalId: "   ",
      secret: "sk_test_unused",
    });
    const listActiveSubscriptions = vi.fn();

    const result = await fetchStripeMetrics(config, listActiveSubscriptions);

    expect(result.metrics).toEqual([]);
    expect(listActiveSubscriptions).not.toHaveBeenCalled();
  });

  it("falls back to the shared NUXT_STRIPE_PRODUCT_ID_<SLUG> env var when integration_config.external_id is unset", async () => {
    vi.stubEnv("NUXT_STRIPE_PRODUCT_ID_BASIN", "prod_basin_core");
    const fixture = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "no-active-subscriptions",
    );
    const listActiveSubscriptions = vi.fn(async () => fixture);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "stripe",
      externalId: null,
      secret: "sk_test_basin",
    });

    const result = await fetchStripeMetrics(config, listActiveSubscriptions);

    // Reaching (and calling) Stripe at all proves the env var was picked up
    // as the product-id source — the unconfigured branch never calls it.
    expect(listActiveSubscriptions).toHaveBeenCalled();
    expect(result.metrics).not.toEqual([]);
  });

  it("prefers integration_config.external_id over the env var when both are set", async () => {
    vi.stubEnv("NUXT_STRIPE_PRODUCT_ID_BASIN", "prod_wrong_product");
    const fixture = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "mixed-tier-active-subscriptions",
    );
    const listActiveSubscriptions = vi.fn(async () => fixture);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "stripe",
      externalId: "prod_basin_core, prod_basin_pro",
      secret: "sk_test_basin",
    });

    const result = await fetchStripeMetrics(config, listActiveSubscriptions);

    // If the env var (pointing at a product with no subscriptions in the
    // fixture) had won instead of external_id, mrr would be 0.
    const mrrMetric = result.metrics.find((metric) => metric.metric === "mrr");
    expect(mrrMetric?.value).toBe(37);
  });

  it("emits mrr + active_subscribers metrics for a configured app, scoped to its comma-separated product ids", async () => {
    const fixture = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "mixed-tier-active-subscriptions",
    );
    const listActiveSubscriptions = vi.fn(async () => fixture);
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "stripe",
      externalId: "prod_basin_core, prod_basin_pro",
      secret: "sk_test_basin",
    });

    const result = await fetchStripeMetrics(config, listActiveSubscriptions);

    expect(result.trafficBreakdown).toEqual([]);
    expect(result.syndicationPosts).toEqual([]);
    expect(result.metrics).toHaveLength(2);

    const mrrMetric = result.metrics.find((metric) => metric.metric === "mrr");
    const subscribersMetric = result.metrics.find(
      (metric) => metric.metric === "active_subscribers",
    );

    expect(mrrMetric).toMatchObject({
      vendor: "stripe",
      metric: "mrr",
      value: 37,
      period: "current",
    });
    expect(subscribersMetric).toMatchObject({
      vendor: "stripe",
      metric: "active_subscribers",
      value: 2,
      period: "current",
    });
    expect(mrrMetric?.capturedAt).toBeInstanceOf(Date);
    // Both metrics from the same fetch share one capture timestamp.
    expect(mrrMetric?.capturedAt).toBe(subscribersMetric?.capturedAt);
  });

  it("paginates through every page of subscriptions before computing totals", async () => {
    const pageOne = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "paginated-page-1",
    );
    const pageTwo = await loadFixture<StripeSubscriptionPage>(
      "stripe",
      "paginated-page-2",
    );
    const listActiveSubscriptions = vi.fn(async (startingAfter?: string) =>
      startingAfter === "sub_page1" ? pageTwo : pageOne,
    );
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "stripe",
      externalId: "prod_basin_core",
      secret: "sk_test_basin",
    });

    const result = await fetchStripeMetrics(config, listActiveSubscriptions);

    const mrrMetric = result.metrics.find((metric) => metric.metric === "mrr");
    expect(mrrMetric?.value).toBe(30);
    expect(listActiveSubscriptions).toHaveBeenCalledTimes(2);
  });
});

describe("fetchStripeMetrics stripe detail", () => {
  const config = createTestIntegrationConfig({
    slug: "basin",
    vendor: "stripe",
    externalId: "prod_basin_core",
    secret: "sk_test_basin",
  });
  const subscriptionPage: StripeSubscriptionPage = {
    hasMore: false,
    data: [
      {
        id: "sub_1",
        status: "active",
        discounts: [],
        items: {
          data: [
            {
              id: "si_1",
              quantity: 1,
              discounts: [],
              price: {
                id: "price_1",
                unitAmount: 400,
                currency: "usd",
                product: "prod_basin_core",
                recurring: { interval: "month", intervalCount: 1 },
              },
            },
          ],
        },
      },
    ],
  };

  it("omits stripeDetail entirely when no detail source is given", async () => {
    const result = await fetchStripeMetrics(
      config,
      async () => subscriptionPage,
    );

    expect(result).not.toHaveProperty("stripeDetail");
  });

  it("returns plan revenue and masked, product-scoped events when a detail source is given", async () => {
    const detailSource = {
      getProductName: vi.fn(async () => "Pro"),
      getCustomerEmail: vi.fn(async () => "maria@hey.com"),
      listActivityEvents: vi.fn(async () => ({
        hasMore: false,
        data: [
          {
            id: "evt_mine",
            kind: "new" as const,
            occurredAt: 1_790_000_000,
            objectId: "sub_1",
            currency: "usd",
            customerId: "cus_1",
            customerEmail: null,
            lines: [{ productId: "prod_basin_core", amountCents: 400 }],
          },
          {
            id: "evt_other_app",
            kind: "new" as const,
            occurredAt: 1_790_000_100,
            objectId: "sub_2",
            currency: "usd",
            customerId: "cus_2",
            customerEmail: null,
            lines: [{ productId: "prod_markpost", amountCents: 900 }],
          },
        ],
      })),
    };

    const result = await fetchStripeMetrics(
      config,
      async () => subscriptionPage,
      detailSource,
    );

    expect(result.stripeDetail?.planRevenue).toEqual([
      {
        productId: "prod_basin_core",
        planName: "Pro",
        monthlyRevenue: 4,
        subscribers: 1,
      },
    ]);
    expect(result.stripeDetail?.events).toHaveLength(1);
    expect(result.stripeDetail?.events[0]).toMatchObject({
      eventId: "evt_mine",
      emailMasked: "m••••a@hey.com",
      planName: "Pro",
    });
    expect(detailSource.getCustomerEmail).toHaveBeenCalledTimes(1);
  });

  it("returns an empty (not omitted) detail for an app with a source but no subscriptions or events", async () => {
    const result = await fetchStripeMetrics(
      config,
      async () => ({ data: [], hasMore: false }),
      {
        getProductName: async () => "Pro",
        getCustomerEmail: async () => null,
        listActivityEvents: async () => ({ data: [], hasMore: false }),
      },
    );

    expect(result.stripeDetail).toEqual({ planRevenue: [], events: [] });
  });

  it("still returns the MRR metrics, reports the error, and omits stripeDetail when the detail fetch fails", async () => {
    const result = await fetchStripeMetrics(
      config,
      async () => subscriptionPage,
      {
        getProductName: async () => {
          throw new Error("restricted key cannot read products");
        },
        getCustomerEmail: vi.fn(),
        listActivityEvents: vi.fn(),
      },
    );

    expect(
      result.metrics.find((metric) => metric.metric === "mrr")?.value,
    ).toBe(4);
    expect(result).not.toHaveProperty("stripeDetail");
    expect(mockReportError).toHaveBeenCalledWith(
      "stripe: detail fetch failed",
      expect.objectContaining({
        message: "restricted key cannot read products",
      }),
      { slug: "basin" },
    );
  });

  it("does not build detail for an unconfigured app", async () => {
    const listActivityEvents = vi.fn();
    const result = await fetchStripeMetrics(
      createTestIntegrationConfig({ vendor: "stripe", externalId: null }),
      vi.fn(),
      {
        getProductName: vi.fn(),
        getCustomerEmail: vi.fn(),
        listActivityEvents,
      },
    );

    expect(result).not.toHaveProperty("stripeDetail");
    expect(listActivityEvents).not.toHaveBeenCalled();
  });
});
