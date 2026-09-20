import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SectionLabel from "../../app/components/SectionLabel.vue";

describe("SectionLabel", () => {
  it("renders the label", () => {
    const wrapper = mount(SectionLabel, {
      props: { label: "MONEY & HEALTH" },
    });
    expect(wrapper.find(".label").text()).toBe("MONEY & HEALTH");
  });

  it("omits the meta span when no meta is given", () => {
    const wrapper = mount(SectionLabel, { props: { label: "REACH" } });
    expect(wrapper.find(".meta").exists()).toBe(false);
  });

  it("renders meta text when given", () => {
    const wrapper = mount(SectionLabel, {
      props: { label: "MONEY & HEALTH", meta: "STRIPE · SENTRY" },
    });
    expect(wrapper.find(".meta").text()).toBe("STRIPE · SENTRY");
  });

  it("matches its snapshot with meta", () => {
    expect(
      mount(SectionLabel, {
        props: { label: "MONEY & HEALTH", meta: "STRIPE · SENTRY" },
      }).html(),
    ).toMatchSnapshot();
  });

  it("matches its snapshot without meta", () => {
    expect(
      mount(SectionLabel, { props: { label: "REACH" } }).html(),
    ).toMatchSnapshot();
  });
});
