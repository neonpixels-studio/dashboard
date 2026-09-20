import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppDetailProduct from "../../app/components/AppDetailProduct.vue";
import SectionLabel from "../../app/components/SectionLabel.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import BarMeter from "../../app/components/BarMeter.vue";
import TrafficPanel from "../../app/components/TrafficPanel.vue";
import SourcesFooter from "../../app/components/SourcesFooter.vue";
import { findAppBySlug } from "../../app/config/apps";
import { DETAIL_COMPONENTS } from "./support/detailComponents";

const app = findAppBySlug("basin")!;

// AppDetailProduct is a fixed-data template (content isn't prop-driven yet,
// see AppDetailMarketing.test.ts note); these tests exercise its one real
// prop plus every sub-component it composes, registered the way
// PropertyCard.test.ts registers PropertyCard's children.
function mountDetail() {
  return mount(AppDetailProduct, {
    props: { app },
    global: { components: DETAIL_COMPONENTS },
  });
}

describe("AppDetailProduct", () => {
  it("renders the money & health, users & auth, and traffic section labels in order", () => {
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
    const bars = wrapper.findAllComponents(BarMeter);
    // Plan bars (3) + sign-in method bars (3) — pin the count so this can't
    // pass vacuously if either BarMeter list stops rendering.
    expect(bars).toHaveLength(6);
    expect(bars.every((bar) => bar.props("color") === app.accent)).toBe(true);
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

  it("matches its tile-grid snapshot", () => {
    // See AppDetailMarketing.test.ts's equivalent note — the full-component
    // snapshot is dominated by hardcoded SparkLine bezier paths; the tile
    // grid stays human-reviewable.
    expect(mountDetail().find(".tile-grid").html()).toMatchSnapshot();
  });
});
