import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PropertyCard from "../../app/components/PropertyCard.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import { toAppCardViewModel } from "../../app/utils/appViewModel";
import { findAppBySlug } from "../../app/config/apps";
import type { AppCard } from "../../shared/types/dashboard";

const config = findAppBySlug("basin")!;

const card: AppCard = {
  slug: "basin",
  status: { label: "LIVE", tone: "ok" },
  metrics: [
    {
      metric: "mrr",
      period: "current",
      value: 412,
      capturedAt: "2026-09-20T00:00:00.000Z",
    },
  ],
  sparklines: [],
  integrations: [
    {
      vendor: "sentry",
      enabled: true,
      ok: false,
      lastRunAt: null,
      lastSuccessAt: null,
      error: "timeout",
    },
  ],
};

function mountCard(appCard: AppCard | null) {
  return mount(PropertyCard, {
    props: { app: toAppCardViewModel(config, appCard) },
    global: {
      components: { SkeletonBlock, PropertyCardMetricsSkeleton },
      stubs: { NuxtLink: { template: "<a><slot /></a>" } },
    },
  });
}

describe("PropertyCard", () => {
  it("renders identity fields regardless of whether metrics have loaded", () => {
    const wrapper = mountCard(null);
    expect(wrapper.text()).toContain("basin");
    expect(wrapper.text()).toContain(config.description);
  });

  it("renders skeleton placeholders instead of fabricated metrics when card is null", () => {
    const wrapper = mountCard(null);
    expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
      true,
    );
    expect(wrapper.findAllComponents(SkeletonBlock).length).toBeGreaterThan(0);
    expect(wrapper.find(".chips").exists()).toBe(false);
  });

  it("renders real status and metrics once card data is available", () => {
    const wrapper = mountCard(card);
    expect(wrapper.text()).toContain("LIVE");
    expect(wrapper.text()).toContain("mrr");
    expect(wrapper.text()).toContain("412");
    expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
      false,
    );
  });

  it("marks a failed integration with the danger tone", () => {
    const wrapper = mountCard(card);
    const chip = wrapper.find(".chip-tag");
    expect(chip.classes()).toContain("danger");
  });

  it("matches its snapshot in the loading state", () => {
    expect(mountCard(null).html()).toMatchSnapshot();
  });

  it("matches its snapshot with card data", () => {
    expect(mountCard(card).html()).toMatchSnapshot();
  });
});
