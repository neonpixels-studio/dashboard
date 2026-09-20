import { describe, expect, it, vi } from "vitest";
import {
  fetchStripeMetrics,
  stripeProvider,
} from "../../../../server/integrations/stripe/provider";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type { StripeSubscriptionPage } from "../../../../server/integrations/stripe/types";

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
