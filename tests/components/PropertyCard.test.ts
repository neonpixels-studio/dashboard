import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PropertyCard from "../../app/components/PropertyCard.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import { toAppCardViewModel } from "../../app/utils/appViewModel";
import { findAppBySlug } from "../../app/config/apps";
import type { AppCard, IntegrationHealth } from "../../shared/types/dashboard";

const config = findAppBySlug("basin")!;

function buildIntegration(
  overrides: Partial<IntegrationHealth>,
): IntegrationHealth {
  return {
    vendor: "sentry",
    enabled: true,
    ok: true,
    lastRunAt: null,
    lastSuccessAt: null,
    error: null,
    ...overrides,
  };
}

// Two metrics sharing a name across periods (e.g. `sessions` at 7d and 30d,
// per shared/types/dashboard.ts's MetricSeries doc comment) — the render key
// must include period or Vue warns about duplicate keys and can reuse the
// wrong DOM node on update.
const card: AppCard = {
  slug: "basin",
  status: { label: "LIVE", tone: "ok" },
  metrics: [
    {
      metric: "sessions",
      period: "7d",
      value: 900,
      capturedAt: "2026-09-20T00:00:00.000Z",
    },
    {
      metric: "sessions",
      period: "30d",
      value: 3600,
      capturedAt: "2026-09-20T00:00:00.000Z",
    },
  ],
  sparklines: [],
  integrations: [
    buildIntegration({ vendor: "stripe", ok: true }),
    buildIntegration({ vendor: "sentry", ok: false, error: "timeout" }),
    buildIntegration({ vendor: "clerk", ok: null }),
    buildIntegration({ vendor: "medium", enabled: false }),
  ],
};

function mountCard(appCard: AppCard | null) {
  return mount(PropertyCard, {
    props: { app: toAppCardViewModel(config, appCard) },
    global: {
      components: { SkeletonBlock, PropertyCardMetricsSkeleton },
      stubs: {
        NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
      },
    },
  });
}

describe("PropertyCard", () => {
  it("links to the property's detail page", () => {
    expect(mountCard(null).attributes("href")).toBe("/apps/basin");
  });

  it("renders identity fields regardless of whether metrics have loaded", () => {
    const wrapper = mountCard(null);
    expect(wrapper.text()).toContain("basin");
    expect(wrapper.text()).toContain(config.description);
  });

  it("marks the card aria-busy until metrics have loaded", () => {
    expect(mountCard(null).attributes("aria-busy")).toBe("true");
    expect(mountCard(card).attributes("aria-busy")).toBe("false");
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
    expect(wrapper.text()).toContain("900");
    expect(wrapper.text()).toContain("3600");
    expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
      false,
    );
  });

  it("keys each metric row by metric+period so same-named metrics at different periods don't collide", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = mountCard(card);
    expect(wrapper.findAll(".stat")).toHaveLength(2);
    const duplicateKeyWarning = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes("Duplicate keys"),
    );
    expect(duplicateKeyWarning).toBe(false);
    warnSpy.mockRestore();
  });

  it("caps the rendered stats at PROPERTY_CARD_STAT_COUNT so a property with many metrics can't overflow the fixed-height card", () => {
    const capturedAt = "2026-09-20T00:00:00.000Z";
    const manyMetricsCard: AppCard = {
      ...card,
      metrics: [
        { metric: "mrr", period: "current", value: 1, capturedAt },
        { metric: "users", period: "current", value: 2, capturedAt },
        { metric: "issues", period: "current", value: 3, capturedAt },
        { metric: "sessions", period: "30d", value: 4, capturedAt },
      ],
    };
    const wrapper = mountCard(manyMetricsCard);
    expect(wrapper.findAll(".stat")).toHaveLength(3);
  });

  it.each<[string, string]>([
    ["stripe", "ok"],
    ["sentry", "danger"],
    ["clerk", "warn"],
    ["medium", "muted"],
  ])(
    "renders the %s integration chip with the %s tone",
    (vendor, expectedClass) => {
      const wrapper = mountCard(card);
      const chip = wrapper
        .findAll(".chip-tag")
        .find((node) => node.text() === vendor)!;
      expect(chip.classes()).toContain(expectedClass);
    },
  );

  it("matches its snapshot in the loading state", () => {
    expect(mountCard(null).html()).toMatchSnapshot();
  });

  it("matches its snapshot with card data", () => {
    expect(mountCard(card).html()).toMatchSnapshot();
  });
});
