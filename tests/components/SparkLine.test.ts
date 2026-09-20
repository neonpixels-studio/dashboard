import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SparkLine from "../../app/components/SparkLine.vue";

const PATH = "M0 26.8 C3.4 26.4 13.8 23.3 20.7 24.5";

function mountSpark(props: Record<string, unknown> = {}) {
  return mount(SparkLine, {
    props: {
      path: PATH,
      width: "100%",
      height: 130,
      viewBox: "0 0 600 130",
      color: "#FFB020",
      ...props,
    },
  });
}

describe("SparkLine", () => {
  it("draws the given line path in the given color", () => {
    const wrapper = mountSpark();
    const line = wrapper.find("path:last-of-type");
    expect(line.attributes("d")).toBe(PATH);
    expect(line.attributes("stroke")).toBe("#FFB020");
  });

  it("hides itself from assistive tech when no aria-label is given", () => {
    const wrapper = mountSpark();
    expect(wrapper.attributes("aria-hidden")).toBe("true");
    expect(wrapper.attributes("role")).toBeUndefined();
  });

  it("exposes role=img and the given label when ariaLabel is given", () => {
    const wrapper = mountSpark({
      ariaLabel: "basin.fm daily sessions over the last 30 days",
    });
    expect(wrapper.attributes("role")).toBe("img");
    expect(wrapper.attributes("aria-label")).toBe(
      "basin.fm daily sessions over the last 30 days",
    );
    expect(wrapper.attributes("aria-hidden")).toBeUndefined();
  });

  it("closes the fill path down to the viewBox baseline when filled", () => {
    const wrapper = mountSpark({ filled: true, fillColor: "#FFB02012" });
    const fillPath = wrapper.find("path:first-of-type");
    expect(fillPath.attributes("d")).toBe(`${PATH} L600 130 L0 130 Z`);
    expect(fillPath.attributes("fill")).toBe("#FFB02012");
  });

  it("renders no fill path when filled is false", () => {
    const wrapper = mountSpark();
    expect(wrapper.findAll("path")).toHaveLength(1);
  });

  it("draws one gridline per entry, giving only the last the baseline stroke", () => {
    const wrapper = mountSpark({ gridLines: [12, 51, 90, 129] });
    const lines = wrapper.findAll("line");
    expect(lines).toHaveLength(4);
    expect(lines[0].attributes("stroke")).toBe("var(--line-3)");
    expect(lines[3].attributes("stroke")).toBe("var(--line)");
  });

  it("matches its snapshot", () => {
    expect(
      mountSpark({
        filled: true,
        fillColor: "color-mix(in srgb, #FFB020 7%, transparent)",
        gridLines: [12, 51, 90, 129],
        ariaLabel: "basin.fm daily sessions over the last 30 days",
      }).html(),
    ).toMatchSnapshot();
  });
});
