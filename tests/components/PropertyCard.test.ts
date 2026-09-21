import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PropertyCard from "../../app/components/PropertyCard.vue";
import PropertyCardMetrics from "../../app/components/PropertyCardMetrics.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import { toAppCardViewModel } from "../../app/utils/appViewModel";
import { findAppBySlug } from "../../app/config/apps";
import type {
  AppCard,
  IntegrationHealth,
  MetricSeries,
} from "../../shared/types/dashboard";

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

const capturedAt = "2026-09-20T00:00:00.000Z";

const mrrSeries: MetricSeries = {
  metric: "mrr",
  period: "current",
  points: [
    { capturedAt: "2026-08-20T00:00:00.000Z", value: 380 },
    { capturedAt, value: 412 },
  ],
};

// Realistic curated data: mrr/active_subscribers/open_issues are the three
// metrics selectCardStats prioritizes for a "product" template app like
// basin. sessions/posts are included too, to prove the extras get dropped
// rather than overflowing the fixed-height card.
const card: AppCard = {
  slug: "basin",
  status: { label: "LIVE", tone: "ok" },
  metrics: [
    { metric: "mrr", period: "current", value: 412, capturedAt },
    {
      metric: "active_subscribers",
      period: "current",
      value: 96,
      capturedAt,
    },
    { metric: "open_issues", period: "current", value: 3, capturedAt },
    { metric: "sessions", period: "30d", value: 8600, capturedAt },
    { metric: "posts", period: "current", value: 4, capturedAt },
  ],
  sparklines: [mrrSeries],
  integrations: [
    buildIntegration({ vendor: "stripe", ok: true }),
    buildIntegration({ vendor: "sentry", ok: false, error: "timeout" }),
    buildIntegration({ vendor: "clerk", ok: null }),
    buildIntegration({ vendor: "medium", enabled: false }),
  ],
};

function mountCard(appCard: AppCard | null, hasError = false) {
  return mount(PropertyCard, {
    props: { app: toAppCardViewModel(config, appCard), hasError },
    global: {
      components: {
        SkeletonBlock,
        PropertyCardMetrics,
        PropertyCardMetricsSkeleton,
        AppIcon,
        SparkLine,
      },
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

  it("marks the card aria-busy only while genuinely loading, not once it has data or has errored", () => {
    expect(mountCard(null).attributes("aria-busy")).toBe("true");
    expect(mountCard(card).attributes("aria-busy")).toBe("false");
    expect(mountCard(null, true).attributes("aria-busy")).toBe("false");
  });

  it("renders skeleton placeholders instead of fabricated metrics when card is null and there is no error", () => {
    const wrapper = mountCard(null);
    expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
      true,
    );
    expect(wrapper.findAllComponents(SkeletonBlock).length).toBeGreaterThan(0);
    expect(wrapper.find(".chips").exists()).toBe(false);
  });

  describe("error state", () => {
    it("shows an inline error message instead of an endless skeleton when the fetch failed", () => {
      const wrapper = mountCard(null, true);
      expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
        false,
      );
      expect(wrapper.text()).toContain("Couldn't load live data.");
    });

    it("shows a real ERROR status chip rather than an indefinite loading skeleton", () => {
      const wrapper = mountCard(null, true);
      expect(wrapper.find(".status-chip").text()).toBe("ERROR");
      expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(false);
    });

    it("never fabricates integration chips on error", () => {
      expect(mountCard(null, true).find(".chips").exists()).toBe(false);
    });

    it("prefers stale real data over the error message once a card has loaded once", () => {
      const wrapper = mountCard(card, true);
      expect(wrapper.text()).toContain("LIVE");
      expect(wrapper.text()).not.toContain("Couldn't load live data.");
    });
  });

  describe("loaded metrics", () => {
    it("renders real status and the curated stats once card data is available", () => {
      const wrapper = mountCard(card);
      expect(wrapper.text()).toContain("LIVE");
      expect(wrapper.text()).toContain("$412");
      expect(wrapper.text()).toContain("96");
      expect(wrapper.text()).toContain("3");
      expect(wrapper.findComponent(PropertyCardMetricsSkeleton).exists()).toBe(
        false,
      );
    });

    it("curates to MRR/USERS/ISSUES by priority, dropping sessions/posts to stay within PROPERTY_CARD_STAT_COUNT", () => {
      const wrapper = mountCard(card);
      const labels = wrapper.findAll(".micro-label").map((node) => node.text());
      expect(labels).toEqual(["MRR", "USERS", "ISSUES"]);
    });

    it("colors the issues stat by tone (nonzero -> danger) and leaves money/user stats their default color", () => {
      const wrapper = mountCard(card);
      const stats = wrapper.findAll(".stat");
      const issuesValue = stats[2]!.find(".stat-value");
      const mrrValue = stats[0]!.find(".stat-value");
      expect(issuesValue.attributes("style")).toContain("color: var(--err)");
      expect(mrrValue.attributes("style")).toContain("color: var(--ink)");
    });

    it("renders fewer than 3 stats without padding when the app has fewer synced metrics, rather than fabricating placeholders", () => {
      const sparseCard: AppCard = {
        ...card,
        metrics: [{ metric: "mrr", period: "current", value: 50, capturedAt }],
      };
      const wrapper = mountCard(sparseCard);
      expect(wrapper.findAll(".stat")).toHaveLength(1);
    });
  });

  describe("sparkline", () => {
    it("draws a real sparkline from the metric matching the card's leading stat", () => {
      const wrapper = mountCard(card);
      const sparkline = wrapper.findComponent(SparkLine);
      expect(sparkline.exists()).toBe(true);
      expect(sparkline.props("path").length).toBeGreaterThan(0);
      expect(sparkline.props("color")).toBe(config.accent);
    });

    it("hides the sparkline when the matching series has fewer than 2 points", () => {
      const onePointCard: AppCard = {
        ...card,
        sparklines: [{ ...mrrSeries, points: [mrrSeries.points[0]!] }],
      };
      expect(mountCard(onePointCard).findComponent(SparkLine).exists()).toBe(
        false,
      );
    });

    it("hides the sparkline entirely when the app has no series data synced yet", () => {
      const noSeriesCard: AppCard = { ...card, sparklines: [] };
      expect(mountCard(noSeriesCard).findComponent(SparkLine).exists()).toBe(
        false,
      );
    });
  });

  describe("integration chips", () => {
    it.each<[string, string, string]>([
      ["stripe", "ok", "STRIPE"],
      ["sentry", "danger", "SENTRY"],
      ["clerk", "warn", "CLERK"],
      ["medium", "muted", "+ CONNECT MEDIUM"],
    ])(
      "renders the %s integration chip with the %s tone and %s label",
      (_vendor, expectedClass, expectedLabel) => {
        const wrapper = mountCard(card);
        const chip = wrapper
          .findAll(".chip-tag")
          .find((node) => node.text() === expectedLabel)!;
        expect(chip).toBeDefined();
        expect(chip.classes()).toContain(expectedClass);
      },
    );
  });

  it("matches its snapshot in the loading state", () => {
    expect(mountCard(null).html()).toMatchSnapshot();
  });

  it("matches its snapshot in the error state", () => {
    expect(mountCard(null, true).html()).toMatchSnapshot();
  });

  it("matches its snapshot with card data", () => {
    expect(mountCard(card).html()).toMatchSnapshot();
  });
});
