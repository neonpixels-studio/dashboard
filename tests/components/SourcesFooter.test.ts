import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SourcesFooter from "../../app/components/SourcesFooter.vue";

describe("SourcesFooter", () => {
  it("renders one chip per source, defaulting untoned sources to ok", () => {
    const wrapper = mount(SourcesFooter, {
      props: {
        sources: [
          { label: "GOOGLE ANALYTICS · 4m" },
          { label: "ZYVOP · 2d", tone: "warn" },
        ],
      },
    });
    const chips = wrapper.findAll(".source-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].text()).toContain("GOOGLE ANALYTICS · 4m");
    expect(chips[0].classes()).toContain("ok");
    expect(chips[1].classes()).toContain("warn");
  });

  it("omits the note and note-tag spans when not given", () => {
    const wrapper = mount(SourcesFooter, {
      props: { sources: [{ label: "CLERK · 4m" }] },
    });
    expect(wrapper.find(".note").exists()).toBe(false);
    expect(wrapper.find(".note-tag").exists()).toBe(false);
  });

  it("renders the note and note-tag when given", () => {
    const wrapper = mount(SourcesFooter, {
      props: {
        sources: [{ label: "GOOGLE ANALYTICS · 6m" }],
        note: "MEDIUM · HASHNODE · DEV.TO · ZYVOP",
        noteTag: "NOT USED ON THIS APP",
      },
    });
    expect(wrapper.find(".note").text()).toBe(
      "MEDIUM · HASHNODE · DEV.TO · ZYVOP",
    );
    expect(wrapper.find(".note-tag").text()).toBe("NOT USED ON THIS APP");
  });

  it("matches its snapshot", () => {
    expect(
      mount(SourcesFooter, {
        props: {
          sources: [
            { label: "GOOGLE ANALYTICS · 4m" },
            { label: "CLERK · 4m" },
            { label: "ZYVOP · 2d", tone: "warn" },
          ],
          noteTag: "STRIPE · CLERK · SENTRY NOT CONNECTED",
        },
      }).html(),
    ).toMatchSnapshot();
  });
});
