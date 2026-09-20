import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PropertySessionsChart from "../../app/components/PropertySessionsChart.vue";

const series = [
  { slug: "danholloran", color: "#A78BFA", path: "M0 14 C5 16.2", endY: 20 },
  { slug: "grimicorn", color: "#B4F03C", path: "M0 40 C5 41", endY: 60 },
];

describe("PropertySessionsChart", () => {
  it("draws one line and one endpoint dot per series entry", () => {
    const wrapper = mount(PropertySessionsChart, { props: { series } });
    expect(wrapper.findAll("path")).toHaveLength(2);
    expect(wrapper.findAll("circle")).toHaveLength(2);
  });

  it("colors each line and dot from its own series entry", () => {
    const wrapper = mount(PropertySessionsChart, { props: { series } });
    const paths = wrapper.findAll("path");
    const circles = wrapper.findAll("circle");
    expect(paths[0].attributes("stroke")).toBe("#A78BFA");
    expect(paths[0].attributes("d")).toBe(series[0].path);
    expect(circles[1].attributes("fill")).toBe("#B4F03C");
    expect(circles[1].attributes("cy")).toBe("60");
  });

  it("renders zero lines and dots for an empty series", () => {
    const wrapper = mount(PropertySessionsChart, { props: { series: [] } });
    expect(wrapper.findAll("path")).toHaveLength(0);
    expect(wrapper.findAll("circle")).toHaveLength(0);
  });

  it("exposes a static descriptive aria-label", () => {
    const wrapper = mount(PropertySessionsChart, { props: { series } });
    expect(wrapper.attributes("aria-label")).toContain(
      "Daily sessions for five properties",
    );
  });

  it("matches its snapshot", () => {
    expect(
      mount(PropertySessionsChart, { props: { series } }).html(),
    ).toMatchSnapshot();
  });
});
