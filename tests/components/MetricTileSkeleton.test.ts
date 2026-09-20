import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MetricTileSkeleton from "../../app/components/MetricTileSkeleton.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";

describe("MetricTileSkeleton", () => {
  it("renders three placeholder blocks (label, value, sub)", () => {
    const wrapper = mount(MetricTileSkeleton, {
      global: { components: { SkeletonBlock } },
    });
    expect(wrapper.findAllComponents(SkeletonBlock)).toHaveLength(3);
  });

  it("matches its snapshot", () => {
    const wrapper = mount(MetricTileSkeleton, {
      global: { components: { SkeletonBlock } },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
