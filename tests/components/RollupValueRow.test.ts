import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RollupValueRow from "../../app/components/RollupValueRow.vue";

function mountRow(props: Record<string, unknown> = {}) {
  return mount(RollupValueRow, {
    props: { valueLabel: "401", deltaLabel: "▲ 22", ...props },
  });
}

describe("RollupValueRow", () => {
  it("renders the value and delta", () => {
    const wrapper = mountRow();
    expect(wrapper.find(".rollup-value").text()).toBe("401");
    expect(wrapper.find(".delta").text()).toBe("▲ 22");
  });

  it("hides the delta span entirely when there is no delta yet, rather than showing an empty one", () => {
    const wrapper = mountRow({ deltaLabel: null });
    expect(wrapper.find(".delta").exists()).toBe(false);
  });

  it("defaults the delta tone to muted", () => {
    const wrapper = mountRow();
    expect(wrapper.find(".delta").classes()).toContain("muted");
  });

  it("applies the ok tone when given one", () => {
    const wrapper = mountRow({ deltaTone: "ok" });
    expect(wrapper.find(".delta").classes()).toContain("ok");
  });

  it("matches its snapshot", () => {
    expect(mountRow().html()).toMatchSnapshot();
  });
});
