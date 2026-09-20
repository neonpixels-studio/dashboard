import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppDetailProduct from "../../app/components/AppDetailProduct.vue";
import SectionLabel from "../../app/components/SectionLabel.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import AxisRow from "../../app/components/AxisRow.vue";
import BarMeter from "../../app/components/BarMeter.vue";
import StatList from "../../app/components/StatList.vue";
import TrafficPanel from "../../app/components/TrafficPanel.vue";
import SourcesFooter from "../../app/components/SourcesFooter.vue";
import { findAppBySlug } from "../../app/config/apps";

const app = findAppBySlug("basin")!;

// AppDetailProduct is a fixed-data template (content isn't prop-driven yet,
// see AppDetailMarketing.test.ts note); these tests exercise its one real
// prop plus every sub-component it composes, registered the way
// PropertyCard.test.ts registers PropertyCard's children.
function mountDetail() {
  return mount(AppDetailProduct, {
    props: { app },
    global: {
      components: {
        SectionLabel,
        MetricTile,
        AppIcon,
        SparkLine,
        AxisRow,
        BarMeter,
        StatList,
        TrafficPanel,
        SourcesFooter,
      },
    },
  });
}

describe("AppDetailProduct", () => {
  it("renders the money & health and users & auth section labels", () => {
    const wrapper = mountDetail();
    const labels = wrapper
      .findAllComponents(SectionLabel)
      .map((node) => node.props("label"));
    expect(labels).toEqual(["MONEY & HEALTH", "USERS & AUTH", "TRAFFIC"]);
  });

  it("renders the four headline metric tiles", () => {
    const wrapper = mountDetail();
    expect(wrapper.findAllComponents(MetricTile)).toHaveLength(4);
    expect(wrapper.text()).toContain("MRR");
    expect(wrapper.text()).toContain("$412");
  });

  it("colors the MRR chart and plan bars in the app's accent", () => {
    const wrapper = mountDetail();
    expect(wrapper.findComponent(SparkLine).props("color")).toBe(app.accent);
    expect(
      wrapper
        .findAllComponents(BarMeter)
        .every((bar) => bar.props("color") === app.accent),
    ).toBe(true);
  });

  it("renders the transaction and issue rows", () => {
    const wrapper = mountDetail();
    expect(wrapper.findAll(".transaction")).toHaveLength(4);
    expect(wrapper.findAll(".issue")).toHaveLength(3);
    expect(wrapper.text()).toContain("TypeError: feed.items is undefined");
  });

  it("passes the app through to the traffic panel and sources footer", () => {
    const wrapper = mountDetail();
    expect(wrapper.findComponent(TrafficPanel).props("app")).toStrictEqual(app);
    expect(wrapper.findComponent(SourcesFooter).exists()).toBe(true);
  });

  it("matches its snapshot", () => {
    expect(mountDetail().html()).toMatchSnapshot();
  });
});
