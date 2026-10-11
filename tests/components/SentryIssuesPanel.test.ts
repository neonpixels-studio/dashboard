import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SentryIssuesPanel from "../../app/components/SentryIssuesPanel.vue";
import PanelHead from "../../app/components/PanelHead.vue";
import SentryEventsTrend from "../../app/components/SentryEventsTrend.vue";
import SentryIssueList from "../../app/components/SentryIssueList.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";
import { findAppBySlug } from "../../app/config/apps";
import type { SentryPanelResponse } from "../../shared/types/dashboard";

const app = findAppBySlug("basin")!;

const PANEL: SentryPanelResponse = {
  issues: [
    {
      id: "1",
      title: "TypeError: feed.items is undefined",
      level: "error",
      culprit: "parsers/rss.ts",
      eventCount: 41,
      userCount: 14,
      lastSeen: "2026-09-19T00:00:00.000Z",
      permalink: "https://sentry.io/organizations/acme/issues/1/",
    },
    {
      id: "2",
      title: "Slow query",
      level: "warning",
      culprit: "",
      eventCount: 1,
      userCount: 0,
      lastSeen: "2026-09-18T00:00:00.000Z",
      permalink: "https://sentry.io/organizations/acme/issues/2/",
    },
  ],
  trend: [
    { capturedAt: "2026-09-18T00:00:00.000Z", value: 4 },
    { capturedAt: "2026-09-19T00:00:00.000Z", value: 38 },
  ],
  trendTotalEvents: 42,
  issuesUrl: "https://sentry.io/organizations/acme/issues/?project=7",
};

function mountPanel(
  props: Partial<{
    panel: SentryPanelResponse | null;
    pending: boolean;
    error: unknown;
  }> = {},
) {
  return mount(SentryIssuesPanel, {
    props: { app, panel: PANEL, pending: false, error: null, ...props },
    global: {
      components: {
        PanelHead,
        SentryEventsTrend,
        SentryIssueList,
        SparkLine,
        SkeletonBlock,
      },
    },
  });
}

describe("SentryIssuesPanel", () => {
  it("links every issue row to its Sentry issue in a new tab", () => {
    const links = mountPanel().findAll(".issue-link");

    expect(links.map((link) => link.attributes("href"))).toEqual([
      PANEL.issues[0]!.permalink,
      PANEL.issues[1]!.permalink,
    ]);
    for (const link of links) {
      expect(link.attributes("target")).toBe("_blank");
      expect(link.attributes("rel")).toBe("noopener noreferrer");
    }
  });

  it("links 'View all issues' to the project's issues in Sentry", () => {
    const link = mountPanel().get(".view-all");

    expect(link.attributes("href")).toBe(PANEL.issuesUrl);
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
  });

  it("shows the live event total and trend, with no sample data label", () => {
    const wrapper = mountPanel();

    expect(wrapper.get(".trend-value").text()).toBe("42");
    expect(wrapper.findComponent(SparkLine).props("path")).not.toBe("");
    expect(wrapper.find(".sample-chip").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("SAMPLE DATA");
  });

  it("renders the issue's real figures", () => {
    const text = mountPanel().findAll(".issue")[0]!.text();

    expect(text).toContain("TypeError: feed.items is undefined");
    expect(text).toContain("ERROR");
    expect(text).toContain("parsers/rss.ts");
    expect(text).toContain("41 events");
    expect(text).toContain("14 users");
  });

  it("shows an empty state, and no trend, when there are no unresolved issues", () => {
    const wrapper = mountPanel({
      panel: { ...PANEL, issues: [], trend: [], trendTotalEvents: 0 },
    });

    expect(wrapper.text()).toContain("No unresolved issues.");
    expect(wrapper.find(".issues").exists()).toBe(false);
    expect(wrapper.findComponent(SparkLine).exists()).toBe(false);
    expect(wrapper.find(".view-all").exists()).toBe(true);
  });

  it("shows a skeleton while loading", () => {
    const wrapper = mountPanel({ panel: null, pending: true });

    expect(wrapper.findComponent(SkeletonBlock).exists()).toBe(true);
    expect(wrapper.find(".issues").exists()).toBe(false);
  });

  it("shows an error with retry instead of zeros, and retry emits", async () => {
    const wrapper = mountPanel({ panel: null, error: new Error("boom") });

    expect(wrapper.get("[role=alert]").text()).toContain(
      "Couldn't load Sentry issues.",
    );
    expect(wrapper.find(".issues").exists()).toBe(false);
    await wrapper.get(".retry-btn").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("keeps showing the last data when a refresh errors", () => {
    const wrapper = mountPanel({ error: new Error("boom") });

    expect(wrapper.findAll(".issue")).toHaveLength(2);
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
  });

  it("shows relative last-seen time only after mount", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-19T00:12:00.000Z") });
    const wrapper = mountPanel();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll("time")[0]!.text()).toBe("12m ago");
    vi.useRealTimers();
  });

  it("matches its snapshot", () => {
    expect(mountPanel().html()).toMatchSnapshot();
  });

  it("matches its empty-state snapshot", () => {
    expect(
      mountPanel({
        panel: { ...PANEL, issues: [], trend: [], trendTotalEvents: 0 },
      }).html(),
    ).toMatchSnapshot();
  });
});
