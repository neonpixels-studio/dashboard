import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppDetailMarketing from "../../app/components/AppDetailMarketing.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import AppIcon from "../../app/components/AppIcon.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import AxisRow from "../../app/components/AxisRow.vue";
import BarMeter from "../../app/components/BarMeter.vue";
import StatList from "../../app/components/StatList.vue";
import { findAppBySlug } from "../../app/config/apps";

// AppDetailMarketing is a fixed-data template (issue #28 scope note: content
// isn't prop-driven yet), so these tests exercise the one real prop it takes
// — `app` — plus the sub-components it composes, mirroring how
// PropertyCard.test.ts registers the components PropertyCard relies on.
function mountDetail(slug: string) {
  return mount(AppDetailMarketing, {
    props: { app: findAppBySlug(slug)! },
    global: {
      components: {
        MetricTile,
        AppIcon,
        SparkLine,
        AxisRow,
        BarMeter,
        StatList,
      },
    },
  });
}

describe("AppDetailMarketing", () => {
  it("renders the four headline metric tiles", () => {
    const wrapper = mountDetail("grimicorn");
    expect(wrapper.findAllComponents(MetricTile)).toHaveLength(4);
    expect(wrapper.text()).toContain("SESSIONS");
    expect(wrapper.text()).toContain("6,104");
  });

  it("charts sessions in the app's accent color for a product property", () => {
    const wrapper = mountDetail("grimicorn");
    expect(wrapper.findComponent(SparkLine).props("color")).toBe(
      findAppBySlug("grimicorn")!.accent,
    );
  });

  it("charts sessions in neutral ink for the studio site", () => {
    const wrapper = mountDetail("neonpixels");
    expect(wrapper.findComponent(SparkLine).props("color")).toBe("var(--ink)");
  });

  it("renders an outbound-click bar per resolvable app slug", () => {
    const wrapper = mountDetail("grimicorn");
    // OUTBOUND_CLICKS lists 4 slugs, all of which resolve via findAppBySlug.
    expect(wrapper.findAllComponents(BarMeter)).toHaveLength(4);
  });

  it("renders the traffic-source and device stat lists", () => {
    const wrapper = mountDetail("grimicorn");
    const lists = wrapper.findAllComponents(StatList);
    expect(lists).toHaveLength(2);
    expect(wrapper.text()).toContain("TRAFFIC SOURCES");
    expect(wrapper.text()).toContain("DEVICE");
  });

  it("renders the deploy log entries", () => {
    const wrapper = mountDetail("grimicorn");
    expect(wrapper.findAll(".deploys li")).toHaveLength(4);
    expect(wrapper.text()).toContain("copy tweak on hero");
  });

  it("matches its snapshot", () => {
    expect(mountDetail("grimicorn").html()).toMatchSnapshot();
  });
});
