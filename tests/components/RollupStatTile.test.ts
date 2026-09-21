import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RollupStatTile from "../../app/components/RollupStatTile.vue";
import RollupValueRow from "../../app/components/RollupValueRow.vue";
import StatList from "../../app/components/StatList.vue";

function mountTile(props: Record<string, unknown> = {}) {
  return mount(RollupStatTile, {
    props: {
      label: "ACTIVE SUBSCRIBERS",
      valueLabel: "401",
      deltaLabel: "▲ 22",
      deltaTone: "ok",
      items: [{ label: "basin.fm", value: "126", swatch: "#FFB020" }],
      emptyMessage: "No subscriber data synced yet.",
      ...props,
    },
    global: { components: { RollupValueRow, StatList } },
  });
}

describe("RollupStatTile", () => {
  it("renders the label, value, and delta", () => {
    const wrapper = mountTile();
    expect(wrapper.find(".metric-label").text()).toBe("ACTIVE SUBSCRIBERS");
    expect(wrapper.find(".rollup-value").text()).toBe("401");
    expect(wrapper.find(".delta").text()).toBe("▲ 22");
    expect(wrapper.find(".delta").classes()).toContain("ok");
  });

  it("renders the StatList when items are present", () => {
    const wrapper = mountTile();
    expect(wrapper.findComponent(StatList).exists()).toBe(true);
    expect(wrapper.find(".rollup-empty").exists()).toBe(false);
  });

  it("shows the empty message instead of an empty StatList when there are no items", () => {
    const wrapper = mountTile({ items: [] });
    expect(wrapper.findComponent(StatList).exists()).toBe(false);
    expect(wrapper.find(".rollup-empty").text()).toBe(
      "No subscriber data synced yet.",
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
