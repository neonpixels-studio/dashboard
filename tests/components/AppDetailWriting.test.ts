import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppDetailWriting from "../../app/components/AppDetailWriting.vue";
import SectionLabel from "../../app/components/SectionLabel.vue";
import MetricTile from "../../app/components/MetricTile.vue";
import SyndicationPostMatrix from "../../app/components/SyndicationPostMatrix.vue";
import TrafficPanel from "../../app/components/TrafficPanel.vue";
import SourcesFooter from "../../app/components/SourcesFooter.vue";
import { findAppBySlug } from "../../app/config/apps";
import { DETAIL_COMPONENTS } from "./support/detailComponents";

const app = findAppBySlug("danholloran")!;

// AppDetailWriting is a fixed-data template (content isn't prop-driven yet,
// see AppDetailMarketing.test.ts note); these tests exercise its one real
// prop plus every sub-component it composes.
function mountDetail() {
  return mount(AppDetailWriting, {
    props: { app },
    global: { components: DETAIL_COMPONENTS },
  });
}

describe("AppDetailWriting", () => {
  it("renders the reach and traffic section labels", () => {
    const wrapper = mountDetail();
    const labels = wrapper
      .findAllComponents(SectionLabel)
      .map((node) => node.props("label"));
    expect(labels).toEqual(["REACH", "TRAFFIC"]);
  });

  it("renders the four headline metric tiles", () => {
    const wrapper = mountDetail();
    expect(wrapper.findAllComponents(MetricTile)).toHaveLength(4);
    expect(wrapper.text()).toContain("SYNDICATED VIEWS");
    expect(wrapper.text()).toContain("8,914");
  });

  it("renders the per-platform syndication table with a warn state for the failing platform", () => {
    const wrapper = mountDetail();
    const rows = wrapper.findAll(".platform-row");
    expect(rows).toHaveLength(4);
    const zyvopRow = rows.find((row) => row.text().includes("ZyVOP"))!;
    expect(zyvopRow.find(".status-pill").classes()).toContain("warn");
    expect(zyvopRow.text()).toContain("API 502");
  });

  it("hands the platform list and posts to the syndication matrix", () => {
    const wrapper = mountDetail();
    const matrix = wrapper.findComponent(SyndicationPostMatrix);
    expect(matrix.props("platforms")).toEqual([
      "Medium",
      "Hashnode",
      "dev.to",
      "ZyVOP",
    ]);
    expect(matrix.props("posts")).toHaveLength(3);
  });

  it("passes the app through to the traffic panel", () => {
    expect(
      mountDetail().findComponent(TrafficPanel).props("app"),
    ).toStrictEqual(app);
  });

  it("flags Stripe/Clerk/Sentry as not connected in the sources footer", () => {
    expect(mountDetail().findComponent(SourcesFooter).props("noteTag")).toBe(
      "STRIPE · CLERK · SENTRY NOT CONNECTED",
    );
  });

  it("matches its tile-grid snapshot", () => {
    // See AppDetailMarketing.test.ts's equivalent note — the full-component
    // snapshot is dominated by hardcoded SparkLine bezier paths; the tile
    // grid stays human-reviewable.
    expect(mountDetail().find(".tile-grid").html()).toMatchSnapshot();
  });
});
