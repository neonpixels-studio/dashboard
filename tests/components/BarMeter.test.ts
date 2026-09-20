import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import BarMeter from "../../app/components/BarMeter.vue";

describe("BarMeter", () => {
  it("renders the label and fills the track to the given percentage", () => {
    const wrapper = mount(BarMeter, {
      props: { label: "Pro · $4/mo", pct: 76, color: "#FFB020" },
    });
    expect(wrapper.find(".label").text()).toBe("Pro · $4/mo");
    expect(wrapper.find(".fill").attributes("style")).toContain("width: 76%");
  });

  it("colors the fill and swatch from the color prop", () => {
    const wrapper = mount(BarMeter, {
      props: {
        label: "basin.fm",
        pct: 41,
        color: "#FFB020",
        value: "612",
        swatch: true,
      },
    });
    expect(wrapper.find(".fill").attributes("style")).toContain(
      "background: #FFB020",
    );
    expect(wrapper.find(".swatch").attributes("style")).toContain(
      "background: #FFB020",
    );
  });

  it("omits the swatch when swatch is not set", () => {
    const wrapper = mount(BarMeter, {
      props: { label: "GitHub", pct: 61, color: "#22D3EE", pctLabel: "61%" },
    });
    expect(wrapper.find(".swatch").exists()).toBe(false);
    expect(wrapper.find(".pct").text()).toBe("61%");
  });

  it("omits the value span when no value is given", () => {
    const wrapper = mount(BarMeter, {
      props: { label: "Google", pct: 28, color: "#22D3EE" },
    });
    expect(wrapper.find(".value").exists()).toBe(false);
  });

  it("matches its snapshot", () => {
    expect(
      mount(BarMeter, {
        props: {
          label: "basin.fm",
          pct: 41,
          color: "#FFB020",
          value: "612",
          pctLabel: "41%",
          swatch: true,
        },
      }).html(),
    ).toMatchSnapshot();
  });
});
