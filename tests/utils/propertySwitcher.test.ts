import { describe, expect, it } from "vitest";
import { APPS } from "../../app/config/apps";
import { buildSwitcherItems } from "../../app/utils/propertySwitcher";

const NO_LOCATION = { query: {}, hash: "" };

describe("buildSwitcherItems", () => {
  it("lists every property in grid order", () => {
    const items = buildSwitcherItems("markpost", NO_LOCATION);
    expect(items.map((item) => item.slug)).toEqual(APPS.map((app) => app.slug));
  });

  it("orders by the grid, not by the order of the source list", () => {
    const shuffled = [...APPS].reverse();
    const items = buildSwitcherItems("basin", NO_LOCATION, shuffled);
    expect(items.map((item) => item.slug)).toEqual(APPS.map((app) => app.slug));
  });

  it("flags only the current property", () => {
    const items = buildSwitcherItems("farflung", NO_LOCATION);
    expect(
      items.filter((item) => item.current).map((item) => item.slug),
    ).toEqual(["farflung"]);
  });

  it("excludes internal apps such as dashboard", () => {
    const sources = [
      ...APPS,
      { slug: "dashboard", name: "dashboard", accent: "#9A9AA8" },
    ];
    const items = buildSwitcherItems("basin", NO_LOCATION, sources);
    expect(items.map((item) => item.slug)).not.toContain("dashboard");
  });

  it("links to the detail page, keeping the query and hash", () => {
    const items = buildSwitcherItems("markpost", {
      query: { range: "7" },
      hash: "#traffic",
    });
    expect(items[0]!.to).toEqual({
      path: "/apps/basin",
      query: { range: "7" },
      hash: "#traffic",
    });
  });

  it("carries each property's name and accent for the swatch", () => {
    const [first] = buildSwitcherItems("markpost", NO_LOCATION);
    expect(first).toMatchObject({
      name: APPS[0]!.name,
      accent: APPS[0]!.accent,
    });
  });
});
