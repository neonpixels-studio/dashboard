import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppDetailProductStripePanel from "../../app/components/AppDetailProductStripePanel.vue";
import BarMeter from "../../app/components/BarMeter.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import { findAppBySlug } from "../../app/config/apps";
import { toAppDetailViewModel } from "../../app/utils/appViewModel";
import { DETAIL_COMPONENTS } from "./support/detailComponents";
import { appDetailFixture } from "../support/appDetailFixture";
import type { AppDetailResponse } from "../../shared/types/dashboard";

const app = findAppBySlug("basin")!;

function mountPanel(detail: AppDetailResponse | null) {
  return mount(AppDetailProductStripePanel, {
    props: { app: toAppDetailViewModel(app, detail) },
    global: { components: DETAIL_COMPONENTS },
  });
}

const LIVE_DETAIL = appDetailFixture({
  series: [
    {
      metric: "mrr",
      period: "current",
      points: [
        { capturedAt: "2026-09-01T00:00:00.000Z", value: 100 },
        { capturedAt: "2026-09-19T00:00:00.000Z", value: 412 },
      ],
    },
  ],
  stripe: {
    environment: "development",
    dashboardUrl: "https://dashboard.stripe.com/test/products",
    plans: [
      { productId: "p1", plan: "Pro", monthlyRevenue: 312, subscribers: 78 },
      {
        productId: "p2",
        plan: "Supporter",
        monthlyRevenue: 100,
        subscribers: 50,
      },
    ],
    events: [
      {
        id: "evt_1",
        kind: "new",
        occurredAt: "2026-09-19T10:00:00.000Z",
        email: "m••••a@hey.com",
        plan: "Pro",
        amount: 4,
        url: "https://dashboard.stripe.com/test/subscriptions/sub_1",
      },
      {
        id: "evt_2",
        kind: "payment_failed",
        occurredAt: "2026-09-18T10:00:00.000Z",
        email: "r••••t@proton.me",
        plan: "Pro",
        amount: 4,
        url: null,
      },
    ],
  },
});

describe("AppDetailProductStripePanel", () => {
  it("renders live MRR, plan bars, and events with no SAMPLE DATA badge", () => {
    const wrapper = mountPanel(LIVE_DETAIL);
    const stripePanel = wrapper.find(".stripe-panel");

    expect(stripePanel.find(".sample-chip").exists()).toBe(false);
    expect(stripePanel.findComponent(SparkLine).exists()).toBe(true);
    const bars = stripePanel.findAllComponents(BarMeter);
    expect(bars.map((bar) => bar.props("label"))).toEqual(["Pro", "Supporter"]);
    expect(bars.map((bar) => bar.props("value"))).toEqual(["$312", "$100"]);
    expect(stripePanel.findAll(".transaction")).toHaveLength(2);
    expect(stripePanel.text()).not.toContain("Lifetime");
  });

  it("tags the panel development for test-mode keys, using the same chip as the overview cards", () => {
    const chip = mountPanel(LIVE_DETAIL).find(".stripe-panel .env-chip");

    expect(chip.exists()).toBe(true);
    expect(chip.text()).toBe("development");
  });

  it("shows no environment chip for a live-mode key", () => {
    const detail = appDetailFixture({
      stripe: { ...LIVE_DETAIL.stripe!, environment: "production" },
    });

    expect(mountPanel(detail).find(".stripe-panel .env-chip").exists()).toBe(
      false,
    );
  });

  it("links the panel and each linkable transaction to Stripe, opening safely in a new tab", () => {
    const wrapper = mountPanel(LIVE_DETAIL);

    const panelLink = wrapper.find(".stripe-link");
    expect(panelLink.attributes("href")).toBe(
      "https://dashboard.stripe.com/test/products",
    );
    expect(panelLink.attributes("rel")).toBe("noopener noreferrer");

    const rowLinks = wrapper.findAll(".tx-link");
    expect(rowLinks).toHaveLength(1);
    expect(rowLinks[0]!.attributes("href")).toBe(
      "https://dashboard.stripe.com/test/subscriptions/sub_1",
    );
    expect(rowLinks[0]!.attributes("target")).toBe("_blank");
  });

  it("marks a payment failure as a warning row", () => {
    const failed = mountPanel(LIVE_DETAIL).findAll(".transaction")[1]!;

    expect(failed.find(".tx-plan").classes()).toContain("warn");
    expect(failed.find(".tx-plan").text()).toBe("Payment failed · Pro");
    expect(failed.find(".tx-amount").classes()).toContain("muted");
  });

  it("shows an empty state, with no chart, bars, or zero amounts, when there is no Stripe data", () => {
    const wrapper = mountPanel(appDetailFixture());
    const stripePanel = wrapper.find(".stripe-panel");

    expect(stripePanel.find(".empty-state").text()).toContain(
      "No Stripe subscriptions",
    );
    expect(stripePanel.findComponent(SparkLine).exists()).toBe(false);
    expect(stripePanel.findAllComponents(BarMeter)).toHaveLength(0);
    expect(stripePanel.find(".transaction").exists()).toBe(false);
    expect(stripePanel.text()).not.toContain("$0");
    expect(stripePanel.find(".stripe-link").exists()).toBe(false);
  });

  it("shows per-section empty text for a configured app with no subscribers yet", () => {
    const wrapper = mountPanel(
      appDetailFixture({
        series: LIVE_DETAIL.series,
        stripe: { ...LIVE_DETAIL.stripe!, plans: [], events: [] },
      }),
    );
    const text = wrapper.find(".stripe-panel").text();

    expect(text).toContain("No active subscriptions.");
    expect(text).toContain("No recent subscription activity.");
  });

  it("matches its Stripe panel snapshot", () => {
    expect(
      mountPanel(LIVE_DETAIL).find(".stripe-panel").html(),
    ).toMatchSnapshot();
  });

  it("matches its Stripe empty-state snapshot", () => {
    expect(
      mountPanel(appDetailFixture()).find(".stripe-panel").html(),
    ).toMatchSnapshot();
  });
});
