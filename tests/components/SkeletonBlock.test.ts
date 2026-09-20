import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SkeletonBlock from "../../app/components/SkeletonBlock.vue";

describe("SkeletonBlock", () => {
  it("applies default width/height/radius", () => {
    const wrapper = mount(SkeletonBlock);
    const style = wrapper.attributes("style");
    expect(style).toContain("width: 100%");
    expect(style).toContain("height: 1em");
  });

  it("applies custom dimensions", () => {
    const wrapper = mount(SkeletonBlock, {
      props: { width: "40px", height: "12px", radius: "50%" },
    });
    const style = wrapper.attributes("style");
    expect(style).toContain("width: 40px");
    expect(style).toContain("height: 12px");
    expect(style).toContain("border-radius: 50%");
  });

  it("hides itself from assistive tech", () => {
    expect(mount(SkeletonBlock).attributes("aria-hidden")).toBe("true");
  });

  it("matches its snapshot", () => {
    expect(mount(SkeletonBlock).html()).toMatchSnapshot();
  });
});
