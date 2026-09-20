import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PropertyCardMetricsSkeleton from "../../app/components/PropertyCardMetricsSkeleton.vue";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";

describe("PropertyCardMetricsSkeleton", () => {
  it("renders three placeholder stats plus a sparkline placeholder", () => {
    const wrapper = mount(PropertyCardMetricsSkeleton, {
      global: { components: { SkeletonBlock } },
    });
    expect(wrapper.findAll(".stat-skeleton")).toHaveLength(3);
    // 2 blocks per stat (label + value) + 1 sparkline placeholder.
    expect(wrapper.findAllComponents(SkeletonBlock)).toHaveLength(7);
  });

  it("matches its snapshot", () => {
    const wrapper = mount(PropertyCardMetricsSkeleton, {
      global: { components: { SkeletonBlock } },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
