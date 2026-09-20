import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppDetailMarketing from "../../app/components/AppDetailMarketing.vue";
import BarMeter from "../../app/components/BarMeter.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import SparkLine from "../../app/components/SparkLine.vue";
import StatList from "../../app/components/StatList.vue";
import { findAppBySlug } from "../../app/config/apps";
import { DETAIL_COMPONENTS } from "./support/detailComponents";

// AppDetailMarketing is a fixed-data template (issue #28 scope note: content
// isn't prop-driven yet), so these tests exercise the one real prop it takes
// — `app` — plus the sub-components it composes, mirroring how
// PropertyCard.test.ts registers the components PropertyCard relies on.
function mountDetail(slug: string) {
  return mount(AppDetailMarketing, {
    props: { app: findAppBySlug(slug)! },
    global: { components: DETAIL_COMPONENTS },
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

  it("renders an outbound-click bar per configured slug, labeled and colored from that app's own config", () => {
    // OUTBOUND_CLICKS is a module-private constant with no unresolvable
    // slugs today, so the "drops an unresolvable slug" branch in
    // outboundRows' flatMap isn't reachable from a prop-driven test here.
    const wrapper = mountDetail("grimicorn");
    const bars = wrapper.findAllComponents(BarMeter);
    expect(bars.map((bar) => bar.props("label"))).toEqual([
      "grimicorn.dev",
      "wanderist.io",
      "basin.fm",
      "markpost.io",
    ]);
    // Assert against a bar whose target differs from the mounted app
    // (grimicorn) — a bar keyed off `props.app.accent` instead of its own
    // target's accent would still pass on bars[0] by coincidence.
    expect(bars[0].props("color")).toBe(findAppBySlug("grimicorn")!.accent);
    expect(bars[1].props("color")).toBe(findAppBySlug("wanderist")!.accent);
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

  it("matches its tile-grid snapshot", () => {
    // Snapshotting the full component would embed the hardcoded SparkLine
    // bezier paths (hundreds of unreadable coordinates) with no extra
    // coverage beyond the explicit assertions above; the tile grid is the
    // largest subtree that stays human-reviewable in a diff.
    expect(
      mountDetail("grimicorn").find(".tile-grid").html(),
    ).toMatchSnapshot();
  });
});
