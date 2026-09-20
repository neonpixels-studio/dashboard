import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TrafficPanel from "../../app/components/TrafficPanel.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import AxisRow from "../../app/components/AxisRow.vue";
import StatList from "../../app/components/StatList.vue";
import { findAppBySlug } from "../../app/config/apps";

const app = findAppBySlug("basin")!;

const stats = [
  { label: "SESSIONS", value: "8,612" },
  { label: "USERS", value: "5,431" },
];

const lists = [
  {
    title: "TOP PAGES",
    items: [
      { label: "/", value: "3,104" },
      { label: "/feed", value: "1,882" },
    ],
  },
  {
    title: "TOP REFERRERS",
    items: [{ label: "Organic search", value: "41%" }],
  },
];

function mountPanel() {
  return mount(TrafficPanel, {
    props: {
      app,
      stats,
      delta: "▲ 22% vs prev 30d",
      path: "M0 14 C5 16.2",
      lists,
    },
    global: { components: { SparkLine, AxisRow, StatList } },
  });
}

describe("TrafficPanel", () => {
  it("renders one headline stat per entry", () => {
    const wrapper = mountPanel();
    const headlineStats = wrapper.findAll(".headline-stats li");
    expect(headlineStats).toHaveLength(2);
    expect(headlineStats[0].text()).toContain("SESSIONS");
    expect(headlineStats[0].text()).toContain("8,612");
  });

  it("renders the period-over-period delta", () => {
    expect(mountPanel().find(".delta").text()).toBe("▲ 22% vs prev 30d");
  });

  it("renders a titled stat list per list entry", () => {
    const wrapper = mountPanel();
    const panels = wrapper.findAll(".traffic-list");
    expect(panels).toHaveLength(2);
    expect(panels[0].text()).toContain("TOP PAGES");
    expect(panels[0].findComponent(StatList).props("items")).toEqual(
      lists[0].items,
    );
  });

  it("colors the sparkline from the app's accent", () => {
    const wrapper = mountPanel();
    expect(wrapper.findComponent(SparkLine).props("color")).toBe(app.accent);
  });

  it("matches its snapshot", () => {
    expect(mountPanel().html()).toMatchSnapshot();
  });
});
