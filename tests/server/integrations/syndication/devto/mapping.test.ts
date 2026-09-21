import { describe, expect, it } from "vitest";
import { toSyndicationSourcePost } from "../../../../../server/integrations/syndication/devto/mapping";

describe("toSyndicationSourcePost (devto)", () => {
  it("maps a DEV.to article's slug and published_at into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: 501,
      slug: "shipping-a-nuxt-dashboard",
      published_at: "2026-09-01T12:05:00Z",
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date("2026-09-01T12:05:00Z"),
    });
  });

  it("throws instead of producing an Invalid Date for an unparseable published_at", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: 502,
        slug: "broken-article",
        published_at: "",
      }),
    ).toThrow(/unparseable published_at/);
  });
});
