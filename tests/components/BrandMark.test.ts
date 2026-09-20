import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BrandMark from "../../app/components/BrandMark.vue";

describe("BrandMark", () => {
  it("defaults to an 18px square mark", () => {
    const wrapper = mount(BrandMark);
    expect(wrapper.attributes("width")).toBe("18");
    expect(wrapper.attributes("height")).toBe("18");
  });

  it("scales to a custom size", () => {
    const wrapper = mount(BrandMark, { props: { size: 32 } });
    expect(wrapper.attributes("width")).toBe("32");
    expect(wrapper.attributes("height")).toBe("32");
  });

  it("hides the decorative mark from assistive tech", () => {
    expect(mount(BrandMark).attributes("aria-hidden")).toBe("true");
  });

  it("renders the four brand squares", () => {
    expect(mount(BrandMark).findAll("rect")).toHaveLength(4);
  });

  it("matches its snapshot", () => {
    expect(mount(BrandMark, { props: { size: 24 } }).html()).toMatchSnapshot();
  });
});
