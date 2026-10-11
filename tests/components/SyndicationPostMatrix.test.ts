import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SyndicationPostMatrix from "../../app/components/SyndicationPostMatrix.vue";

const platforms = ["Medium", "Hashnode", "dev.to", "ZyVOP"];

const posts = [
  {
    title: "Shipping a Nuxt site with an agent that never sleeps",
    url: "https://danholloran.me/posts/shipping-a-nuxt-site",
    cells: [
      {
        label: "✓ LIVE",
        tone: "live" as const,
        views: "1,204 views",
        likes: "30 likes",
        comments: "2 comments",
        url: "https://medium.com/@grimicorn/shipping-1a2b3c4d5e6f",
      },
      {
        label: "✓ LIVE",
        tone: "live" as const,
        views: null,
        likes: null,
        comments: null,
        url: null,
      },
      {
        label: "✓ LIVE",
        tone: "live" as const,
        views: "88 views",
        likes: null,
        comments: null,
        url: null,
      },
      {
        label: "✗ FAILED",
        tone: "failed" as const,
        views: null,
        likes: null,
        comments: null,
        url: null,
      },
    ],
  },
  {
    title: "Three days in the Missouri Ozarks",
    url: "https://danholloran.me/posts/missouri-ozarks",
    cells: [
      {
        label: "✓ LIVE",
        tone: "live" as const,
        views: "3 views",
        likes: null,
        comments: null,
        url: null,
      },
      {
        label: "— NOT POSTED",
        tone: "off" as const,
        views: null,
        likes: null,
        comments: null,
        url: null,
      },
      {
        label: "— NOT POSTED",
        tone: "off" as const,
        views: null,
        likes: null,
        comments: null,
        url: null,
      },
      {
        label: "• QUEUED",
        tone: "queued" as const,
        views: null,
        likes: null,
        comments: null,
        url: null,
      },
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
    expect(
      cells.map((cell) => cell.find(".cell-stat--views").exists()),
    ).toEqual([true, false, true, false]);
    expect(cells[0].find(".cell-stat--views").text()).toBe("1,204 views");
  });

  it("links the title to the canonical post in a new tab", () => {
    const wrapper = mount(SyndicationPostMatrix, {
      props: { platforms, posts },
    });
    const link = wrapper.findAll(".matrix-row")[0].find(".post-link");
    expect(link.attributes("href")).toBe(
      "https://danholloran.me/posts/shipping-a-nuxt-site",
    );
    expect(link.attributes("rel")).toBe("noopener noreferrer");
    expect(link.text()).toBe(posts[0].title);
  });

  it("links only cells that carry a url, with an accessible name", () => {
    const wrapper = mount(SyndicationPostMatrix, {
      props: { platforms, posts },
    });
    const cells = wrapper.findAll(".matrix-row")[0].findAll(".cell-pill");
    expect(cells.map((cell) => cell.element.tagName)).toEqual([
      "A",
      "SPAN",
      "SPAN",
      "SPAN",
    ]);
    expect(cells[0].attributes("href")).toBe(
      "https://medium.com/@grimicorn/shipping-1a2b3c4d5e6f",
    );
    expect(cells[0].attributes("aria-label")).toBe(
      `${posts[0].title} on Medium, ✓ LIVE`,
    );
  });

  it("renders likes and comments lines only where the platform reported them", () => {
    const wrapper = mount(SyndicationPostMatrix, {
      props: { platforms, posts },
    });
    const cells = wrapper.findAll(".matrix-row")[0].findAll(".col-cell");
    expect(cells[0].text()).toContain("30 likes");
    expect(cells[0].text()).toContain("2 comments");
    expect(cells[1].text()).not.toMatch(/like|comment/);
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
