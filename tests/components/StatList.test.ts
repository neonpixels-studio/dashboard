import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import StatList from "../../app/components/StatList.vue";

describe("StatList", () => {
  it("renders one row per item with its label and value", () => {
    const wrapper = mount(StatList, {
      props: {
        items: [
          { label: "Direct", value: "38%" },
          { label: "bsky.app", value: "24%" },
        ],
      },
    });
    const rows = wrapper.findAll(".stat-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].find(".label").text()).toBe("Direct");
    expect(rows[0].find(".value").text()).toBe("38%");
  });

  it("renders a level-chip marker when the item has a chip", () => {
    const wrapper = mount(StatList, {
      props: {
        items: [
          {
            label: "Converted to paid",
            value: "8.0%",
            chip: { label: "8.0%", color: "#B4F03C" },
          },
        ],
      },
    });
    expect(wrapper.find(".level-chip").exists()).toBe(true);
    expect(wrapper.find(".swatch").exists()).toBe(false);
  });

  it("renders a swatch marker when the item has a swatch color", () => {
    const wrapper = mount(StatList, {
      props: {
        items: [{ label: "basin.fm", value: "612", swatch: "#FFB020" }],
      },
    });
    expect(wrapper.find(".swatch").exists()).toBe(true);
    expect(wrapper.find(".level-chip").exists()).toBe(false);
  });

  it("renders neither marker when the item has no chip or swatch", () => {
    const wrapper = mount(StatList, {
      props: { items: [{ label: "Desktop", value: "71%" }] },
    });
    expect(wrapper.find(".swatch").exists()).toBe(false);
    expect(wrapper.find(".level-chip").exists()).toBe(false);
  });

  it("mutes the label when the item is flagged muted", () => {
    const wrapper = mount(StatList, {
      props: {
        items: [{ label: "Prefers dark", value: "83%", muted: true }],
      },
    });
    expect(wrapper.find(".label").classes()).toContain("muted");
  });

  it("renders the delta with the given tone, defaulting to ok", () => {
    const wrapper = mount(StatList, {
      props: {
        items: [
          { label: "MRR", value: "$412", delta: "▲ 38 this week" },
          {
            label: "Churn",
            value: "2.1%",
            delta: "▼ 0.4pp",
            deltaTone: "muted",
          },
        ],
      },
    });
    const deltas = wrapper.findAll(".row-delta");
    expect(deltas[0].classes()).toContain("ok");
    expect(deltas[1].classes()).toContain("muted");
  });

  it("draws dividers between rows by default and omits them when divided is false", () => {
    const items = [
      { label: "Direct", value: "38%" },
      { label: "Organic search", value: "17%" },
    ];
    expect(mount(StatList, { props: { items } }).classes()).toContain(
      "divided",
    );
    expect(
      mount(StatList, { props: { items, divided: false } }).classes(),
    ).not.toContain("divided");
  });

  it("keys each row by label, so reordering two same-label rows reorders the DOM instead of colliding", async () => {
    // Vue's "Duplicate keys" warning only fires on a keyed patch, never on
    // initial mount, so this forces one by re-mounting with two rows that
    // share a label (real once these lists come from the read API instead
    // of hardcoded markup, per StatList's `:key="row.label"`) and asserting
    // the rendered order actually followed a reversal — mirrors
    // PropertyCard.test.ts's equivalent metric-row test.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const items = [
      { label: "Pro · $4/mo", value: "$312" },
      { label: "Pro · $4/mo", value: "$70" },
    ];
    const wrapper = mount(StatList, { props: { items } });
    expect(wrapper.findAll(".value").map((node) => node.text())).toEqual([
      "$312",
      "$70",
    ]);

    await wrapper.setProps({ items: [...items].reverse() });

    expect(wrapper.findAll(".value").map((node) => node.text())).toEqual([
      "$70",
      "$312",
    ]);
    const duplicateKeyWarning = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes("Duplicate keys"),
    );
    expect(duplicateKeyWarning).toBe(false);
    warnSpy.mockRestore();
  });

  it("matches its snapshot", () => {
    expect(
      mount(StatList, {
        props: {
          items: [
            { label: "Direct", value: "38%" },
            {
              label: "Converted to paid",
              value: "8.0%",
              chip: { label: "8.0%", color: "#B4F03C" },
            },
            { label: "basin.fm", value: "612", swatch: "#FFB020" },
            { label: "Prefers dark", value: "83%", muted: true },
          ],
        },
      }).html(),
    ).toMatchSnapshot();
  });
});
