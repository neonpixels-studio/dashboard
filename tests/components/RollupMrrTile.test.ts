import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RollupMrrTile from "../../app/components/RollupMrrTile.vue";
import RollupValueRow from "../../app/components/RollupValueRow.vue";
import SparkLine from "../../app/components/SparkLine.vue";

function mountTile(props: Record<string, unknown> = {}) {
  return mount(RollupMrrTile, {
    props: {
      valueLabel: "$2,145",
      deltaLabel: "▲ 8.2%",
      deltaTone: "ok",
      hasSparkline: true,
      sparklinePath: "M0 36 L320 36",
      ...props,
    },
    global: { components: { RollupValueRow, SparkLine } },
  });
}

describe("RollupMrrTile", () => {
  it("renders the value and delta", () => {
    const wrapper = mountTile();
    expect(wrapper.find(".rollup-value").text()).toBe("$2,145");
    expect(wrapper.find(".delta").text()).toBe("▲ 8.2%");
    expect(wrapper.find(".delta").classes()).toContain("ok");
  });

  it("draws the sparkline with the given path when hasSparkline is true", () => {
    const wrapper = mountTile();
    const sparkline = wrapper.findComponent(SparkLine);
    expect(sparkline.exists()).toBe(true);
    expect(sparkline.props("path")).toBe("M0 36 L320 36");
  });

  it("hides the sparkline and shows an empty message when hasSparkline is false", () => {
    const wrapper = mountTile({ hasSparkline: false });
    expect(wrapper.findComponent(SparkLine).exists()).toBe(false);
    expect(wrapper.find(".rollup-empty").text()).toBe(
      "Not enough synced data for a trend line yet.",
    );
  });

  it("hides the delta span entirely when there is no delta yet", () => {
    const wrapper = mountTile({ deltaLabel: null });
    expect(wrapper.find(".delta").exists()).toBe(false);
  });

  it("matches its snapshot", () => {
    expect(mountTile().html()).toMatchSnapshot();
  });
});
