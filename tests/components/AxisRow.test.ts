import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AxisRow from "../../app/components/AxisRow.vue";

describe("AxisRow", () => {
  it("renders the default 5-week label set when no labels are given", () => {
    const wrapper = mount(AxisRow);
    expect(wrapper.findAll("span").map((node) => node.text())).toEqual([
      "20 AUG",
      "27 AUG",
      "03 SEP",
      "10 SEP",
      "19 SEP",
    ]);
  });

  it("renders custom labels in the given order", () => {
    const wrapper = mount(AxisRow, {
      props: { labels: ["20 AUG", "04 SEP", "19 SEP"] },
    });
    expect(wrapper.findAll("span").map((node) => node.text())).toEqual([
      "20 AUG",
      "04 SEP",
      "19 SEP",
    ]);
  });

  it("matches its snapshot with custom labels", () => {
    expect(
      mount(AxisRow, {
        props: { labels: ["20 AUG", "04 SEP", "19 SEP"] },
      }).html(),
    ).toMatchSnapshot();
  });
});
