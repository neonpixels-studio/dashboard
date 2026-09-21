import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";

describe("PropertyCardMetricsSkeleton", () => {
  it("renders three placeholder stats and nothing beyond them", () => {
    const wrapper = mount(PropertyCardMetricsSkeleton, {
      global: { components: { SkeletonBlock } },
    });
    expect(wrapper.findAll(".stat-skeleton")).toHaveLength(3);
    // 2 blocks per stat (label + value), plus 1 reserving the sparkline's
    // 120x34 footprint so the row doesn't reflow once real data loads.
    expect(wrapper.findAllComponents(SkeletonBlock)).toHaveLength(7);
  });

  it("matches its snapshot", () => {
    const wrapper = mount(PropertyCardMetricsSkeleton, {
      global: { components: { SkeletonBlock } },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
