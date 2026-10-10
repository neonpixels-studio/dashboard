import { describe, expect, it } from "vitest";
import {
  toPostRef,
  toSyndicationSourcePost,
} from "../../../../../server/integrations/syndication/devto/mapping";

describe("toPostRef (devto)", () => {
  it("strips DEV.to's 4-character random slug suffix", () => {
    expect(
      toPostRef("css-reading-flow-fix-the-tab-order-your-layout-broke-2j2k"),
    ).toBe("css-reading-flow-fix-the-tab-order-your-layout-broke");
  });

  it("strips DEV.to's 3-character random slug suffix", () => {
    expect(
      toPostRef("mapgetorinsert-stop-writing-the-hasgetset-dance-bdd"),
    ).toBe("mapgetorinsert-stop-writing-the-hasgetset-dance");
  });

  it("leaves a final segment longer than a suffix alone", () => {
    expect(toPostRef("shipping-a-nuxt-dashboard")).toBe(
      "shipping-a-nuxt-dashboard",
    );
  });
});

describe("toSyndicationSourcePost (devto)", () => {
  it("maps a DEV.to article's suffix-stripped slug, published_at and page_views_count into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: 501,
      slug: "shipping-a-nuxt-dashboard-4p6a",
      published_at: "2026-09-01T12:05:00Z",
      page_views_count: 42,
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date("2026-09-01T12:05:00Z"),
      views: 42,
    });
  });

  it("throws instead of producing an Invalid Date for an unparseable published_at", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: 502,
        slug: "broken-article",
        published_at: "",
        page_views_count: 0,
      }),
    ).toThrow(/unparseable published_at/);
  });
});
