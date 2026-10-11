import { describe, expect, it } from "vitest";
import { toSyndicationSourcePost } from "../../../../../server/integrations/syndication/hashnode/mapping";

describe("toSyndicationSourcePost (hashnode)", () => {
  it("maps a Hashnode post node's slug and publishedAt into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: "hn_1",
      slug: "shipping-a-nuxt-dashboard",
      publishedAt: "2026-09-01T12:00:00.000Z",
      url: "https://danholloran.hashnode.dev/shipping-a-nuxt-dashboard",
      reactionCount: 3,
      responseCount: 1,
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date("2026-09-01T12:00:00.000Z"),
      url: "https://danholloran.hashnode.dev/shipping-a-nuxt-dashboard",
      likes: 3,
      comments: 1,
    });
  });

  it("omits a malformed url and counts instead of storing them", () => {
    const post = toSyndicationSourcePost({
      id: "hn_3",
      slug: "odd-post",
      publishedAt: "2026-09-01T12:00:00.000Z",
      url: "",
      reactionCount: -2,
      responseCount: null as unknown as number,
    });

    expect(post).toEqual({
      postRef: "odd-post",
      publishedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
  });

  it("throws instead of producing an Invalid Date for an unparseable publishedAt", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: "hn_2",
        slug: "broken-post",
        publishedAt: "not-a-date",
        url: "https://danholloran.hashnode.dev/broken-post",
        reactionCount: 0,
        responseCount: 0,
      }),
    ).toThrow(/unparseable publishedAt/);
  });
});
