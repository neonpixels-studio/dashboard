import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppIcon from "../../app/components/AppIcon.vue";

describe("AppIcon", () => {
  it("renders a known icon's path data", () => {
    const wrapper = mount(AppIcon, { props: { name: "checkCircle" } });
    expect(wrapper.find("polyline").exists()).toBe(true);
  });

  it("renders no path data for an unknown icon name", () => {
    const wrapper = mount(AppIcon, { props: { name: "not-a-real-icon" } });
    expect(wrapper.element.innerHTML).toBe("");
  });

  it("defaults size to 18 and stroke-width to 1.7", () => {
    const wrapper = mount(AppIcon, { props: { name: "x" } });
    expect(wrapper.attributes("width")).toBe("18");
    expect(wrapper.attributes("height")).toBe("18");
    expect(wrapper.attributes("stroke-width")).toBe("1.7");
  });

  it("applies a custom size, stroke-width, and extra class", () => {
    const wrapper = mount(AppIcon, {
      props: { name: "triangle", size: 12, strokeWidth: 1.5, cls: "a-ico" },
    });
    expect(wrapper.attributes("width")).toBe("12");
    expect(wrapper.attributes("stroke-width")).toBe("1.5");
    expect(wrapper.classes()).toContain("a-ico");
  });

  it("matches its snapshot", () => {
    expect(
      mount(AppIcon, { props: { name: "info", size: 15 } }).html(),
    ).toMatchSnapshot();
  });
});
