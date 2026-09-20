import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MetricTile from "../../app/components/MetricTile.vue";
import AppIcon from "../../app/components/AppIcon.vue";

function mountTile(props: Record<string, unknown> = {}) {
  return mount(MetricTile, {
    props: {
      label: "MRR",
      value: "$412",
      delta: "▲ 6.4%",
      sub: "$387 last month",
      ...props,
    },
    global: { components: { AppIcon } },
  });
}

describe("MetricTile", () => {
  it("renders the label, value, delta, and sub text", () => {
    const wrapper = mountTile();
    expect(wrapper.find(".tile-label").text()).toBe("MRR");
    expect(wrapper.find(".value").text()).toBe("$412");
    expect(wrapper.find(".delta").text()).toBe("▲ 6.4%");
    expect(wrapper.find(".sub").text()).toBe("$387 last month");
  });

  it("defaults deltaTone to ok", () => {
    expect(mountTile().find(".delta").classes()).toContain("ok");
    expect(mountTile().find(".delta").classes()).not.toContain("muted");
  });

  it("mutes the delta when deltaTone is muted", () => {
    const wrapper = mountTile({ deltaTone: "muted" });
    expect(wrapper.find(".delta").classes()).toContain("muted");
  });

  it("renders no icon and no tone class when tone is not given", () => {
    const wrapper = mountTile();
    expect(wrapper.findComponent(AppIcon).exists()).toBe(false);
    expect(wrapper.classes()).not.toContain("warn");
    expect(wrapper.classes()).not.toContain("danger");
    expect(wrapper.classes()).not.toContain("ok");
  });

  it.each<["warn" | "danger" | "ok", string]>([
    ["warn", "triangle"],
    ["danger", "triangle"],
    ["ok", "checkCircle"],
  ])("shows the %s tone with the %s icon", (tone, iconName) => {
    const wrapper = mountTile({ tone });
    expect(wrapper.classes()).toContain(tone);
    expect(wrapper.findComponent(AppIcon).props("name")).toBe(iconName);
  });

  it("matches its snapshot", () => {
    expect(
      mountTile({
        label: "OPEN ISSUES",
        value: "3",
        delta: "1 new",
        deltaTone: "muted",
        sub: "0 fatal · 3 error",
        tone: "warn",
      }).html(),
    ).toMatchSnapshot();
  });
});
