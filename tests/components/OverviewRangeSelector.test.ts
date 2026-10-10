import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import OverviewRangeSelector from "../../app/components/OverviewRangeSelector.vue";

function mountSelector(modelValue: 7 | 30 | 60) {
  return mount(OverviewRangeSelector, { props: { modelValue } });
}

describe("OverviewRangeSelector", () => {
  it("offers 7, 30 and 60 days in order", () => {
    const labels = mountSelector(30)
      .findAll(".range-option")
      .map((option) => option.text());
    expect(labels).toEqual(["7D", "30D", "60D"]);
  });

  it.each([7, 30, 60] as const)("marks only %i days as pressed", (selected) => {
    const options = mountSelector(selected).findAll(".range-option");
    const pressed = options.filter(
      (option) => option.attributes("aria-pressed") === "true",
    );
    expect(pressed.map((option) => option.attributes("aria-label"))).toEqual([
      `Last ${selected} days`,
    ]);
    expect(options.filter((option) => option.classes("active"))).toHaveLength(
      1,
    );
  });

  it("emits the clicked range", async () => {
    const wrapper = mountSelector(30);
    await wrapper.findAll(".range-option")[0]!.trigger("click");
    await wrapper.findAll(".range-option")[2]!.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[7], [60]]);
  });

  it("matches its snapshot with the default range selected", () => {
    expect(mountSelector(30).html()).toMatchSnapshot();
  });

  it("matches its snapshot with 7 days selected", () => {
    expect(mountSelector(7).html()).toMatchSnapshot();
  });
});
