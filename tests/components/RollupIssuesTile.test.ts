import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RollupIssuesTile from "../../app/components/RollupIssuesTile.vue";
import RollupValueRow from "../../app/components/RollupValueRow.vue";
import StatList from "../../app/components/StatList.vue";
import AppIcon from "../../app/components/AppIcon.vue";

function mountTile(props: Record<string, unknown> = {}) {
  return mount(RollupIssuesTile, {
    props: {
      valueLabel: "11",
      deltaLabel: "3 new today",
      items: [{ label: "basin.fm", value: "6" }],
      emptyMessage: "No issue data synced yet.",
      ...props,
    },
    global: { components: { RollupValueRow, StatList, AppIcon } },
  });
}

describe("RollupIssuesTile", () => {
  it("renders the value and delta text (never an arrow — issues aren't a growth metric)", () => {
    const wrapper = mountTile();
    expect(wrapper.find(".rollup-value").text()).toBe("11");
    expect(wrapper.find(".delta").text()).toBe("3 new today");
  });

  it("always applies the muted delta tone, regardless of direction", () => {
    const wrapper = mountTile();
    expect(wrapper.find(".delta").classes()).toEqual(["delta", "muted"]);
  });

  it("renders the StatList when items are present", () => {
    const wrapper = mountTile();
    expect(wrapper.findComponent(StatList).exists()).toBe(true);
    expect(wrapper.find(".rollup-empty").exists()).toBe(false);
  });

  it("shows the empty message instead of a fabricated count when there are no items", () => {
    const wrapper = mountTile({ items: [], valueLabel: "—", deltaLabel: null });
    expect(wrapper.findComponent(StatList).exists()).toBe(false);
    expect(wrapper.find(".rollup-value").text()).toBe("—");
    expect(wrapper.find(".delta").exists()).toBe(false);
    expect(wrapper.find(".rollup-empty").text()).toBe(
      "No issue data synced yet.",
    );
  });

  it("exposes an #alerts anchor for the top nav's Alerts link", () => {
    expect(mountTile().attributes("id")).toBe("alerts");
  });

  it("matches its snapshot", () => {
    expect(mountTile().html()).toMatchSnapshot();
  });
});
