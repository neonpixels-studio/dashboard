import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SyndicationPostMatrix from "../../app/components/SyndicationPostMatrix.vue";

const platforms = ["Medium", "Hashnode", "dev.to", "ZyVOP"];

const posts = [
  {
    title: "Shipping a Nuxt site with an agent that never sleeps",
    cells: [
      { label: "✓ LIVE", tone: "live" as const, views: "1,204 views" },
      { label: "✓ LIVE", tone: "live" as const, views: null },
      { label: "✓ LIVE", tone: "live" as const, views: "88 views" },
      { label: "✗ FAILED", tone: "failed" as const, views: null },
    ],
  },
  {
    title: "Three days in the Missouri Ozarks",
    cells: [
      { label: "✓ LIVE", tone: "live" as const, views: "3 views" },
      { label: "— NOT POSTED", tone: "off" as const, views: null },
      { label: "— NOT POSTED", tone: "off" as const, views: null },
      { label: "• QUEUED", tone: "queued" as const, views: null },
    ],
  },
];

describe("SyndicationPostMatrix", () => {
  it("renders an uppercased column header per platform", () => {
    const wrapper = mount(SyndicationPostMatrix, {
      props: { platforms, posts },
    });
    const headers = wrapper
      .findAll(".matrix-head .col-cell")
      .map((node) => node.text());
    expect(headers).toEqual(["MEDIUM", "HASHNODE", "DEV.TO", "ZYVOP"]);
  });

  it("renders one row per post with its title", () => {
    const wrapper = mount(SyndicationPostMatrix, {
      props: { platforms, posts },
    });
    const rows = wrapper.findAll(".matrix-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].find(".col-post").text()).toBe(posts[0].title);
  });

  it("renders a views line only for cells whose platform reported views", () => {
    const wrapper = mount(SyndicationPostMatrix, {
      props: { platforms, posts },
    });
    const cells = wrapper.findAll(".matrix-row")[0].findAll(".col-cell");
    expect(cells.map((cell) => cell.find(".cell-views").exists())).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(cells[0].find(".cell-views").text()).toBe("1,204 views");
  });

  it("tones each platform cell pill from the post's own cell status", () => {
    const wrapper = mount(SyndicationPostMatrix, {
      props: { platforms, posts },
    });
    const pills = wrapper.findAll(".matrix-row")[0].findAll(".cell-pill");
    expect(pills[0].classes()).toContain("live");
    expect(pills[0].text()).toBe("✓ LIVE");
    expect(pills[3].classes()).toContain("failed");
    expect(pills[3].text()).toBe("✗ FAILED");
  });

  it("matches its snapshot", () => {
    expect(
      mount(SyndicationPostMatrix, { props: { platforms, posts } }).html(),
    ).toMatchSnapshot();
  });
});
