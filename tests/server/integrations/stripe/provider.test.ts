import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStripeMetrics,
  stripeProvider,
} from "../../../../server/integrations/stripe/provider";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type { StripeSubscriptionPage } from "../../../../server/integrations/stripe/types";

// Only stripeProvider.fetch's own two-line wiring (guard + delegate to
// fetchStripeMetrics) needs the real "stripe" package mocked — every other
// test in this file exercises fetchStripeMetrics directly with an injected
// ListActiveSubscriptions fake and never touches the module.
const { mockSubscriptionsList } = vi.hoisted(() => ({
  mockSubscriptionsList: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class MockStripe {
    static API_VERSION = "mock-api-version";
    subscriptions = { list: mockSubscriptionsList };
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  mockSubscriptionsList.mockReset();
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
      expect.objectContaining({ status: "active" }),
    );
    const mrrMetric = result.metrics.find((metric) => metric.metric === "mrr");
    expect(mrrMetric?.value).toBe(15);
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
