import { describe, expect, it } from "vitest";
import { toSyndicationSourcePost } from "../../../../../server/integrations/syndication/devto/mapping";

describe("toSyndicationSourcePost (devto)", () => {
  it("maps a DEV.to article's slug, published_at and page_views_count into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: 501,
      slug: "shipping-a-nuxt-dashboard",
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
