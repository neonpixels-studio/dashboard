import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PropertyCardMetrics from "../../app/components/PropertyCardMetrics.vue";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import type { AppCard, MetricSeries } from "../../shared/types/dashboard";

const capturedAt = "2026-09-20T00:00:00.000Z";

const mrrSeries: MetricSeries = {
  metric: "mrr",
  period: "current",
  points: [
    { capturedAt: "2026-08-20T00:00:00.000Z", value: 380 },
    { capturedAt, value: 412 },
  ],
};

const card: AppCard = {
  slug: "basin",
  status: { label: "LIVE", tone: "ok" },
  metrics: [{ metric: "mrr", period: "current", value: 412, capturedAt }],
  sparklines: [mrrSeries],
  integrations: [],
};

function mountMetrics(props: { card: AppCard | null; hasError?: boolean }) {
  return mount(PropertyCardMetrics, {
    props: { accent: "#FFB020", appName: "basin.fm", ...props },
    global: {
      components: { PropertyCardMetricsSkeleton, AppIcon, SparkLine },
    },
  });
}

describe("PropertyCardMetrics", () => {
  it("renders the loading skeleton when there is no card and no error", () => {
    const wrapper = mountMetrics({ card: null });
    expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
      true,
    );
  });

  it("shows the inline error message when there is no card and the fetch failed", () => {
    const wrapper = mountMetrics({ card: null, hasError: true });
    expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("Couldn't load live data.");
  });

  it("renders real stats over the error message once a card exists, even if hasError is also true", () => {
    const wrapper = mountMetrics({ card, hasError: true });
    expect(wrapper.text()).not.toContain("Couldn't load live data.");
    expect(wrapper.text()).toContain("$412");
  });

  it("draws the sparkline for the primary stat's series", () => {
    const wrapper = mountMetrics({ card });
    const sparkline = wrapper.findComponent(SparkLine);
    expect(sparkline.exists()).toBe(true);
    expect(sparkline.props("color")).toBe("#FFB020");
  });

  it("hides the sparkline when the app has no series data", () => {
    const wrapper = mountMetrics({ card: { ...card, sparklines: [] } });
    expect(wrapper.findComponent(SparkLine).exists()).toBe(false);
  });

  it("matches its snapshot in the loading state", () => {
    expect(mountMetrics({ card: null }).html()).toMatchSnapshot();
  });

  it("matches its snapshot in the error state", () => {
    expect(
      mountMetrics({ card: null, hasError: true }).html(),
    ).toMatchSnapshot();
  });

  it("matches its snapshot with card data", () => {
    expect(mountMetrics({ card }).html()).toMatchSnapshot();
  });
});
