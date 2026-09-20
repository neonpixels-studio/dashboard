import { describe, expect, it } from "vitest";
import { toSyndicationSourcePost } from "../../../../../server/integrations/syndication/hashnode/mapping";

describe("toSyndicationSourcePost (hashnode)", () => {
  it("maps a Hashnode post node's slug and publishedAt into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: "hn_1",
      slug: "shipping-a-nuxt-dashboard",
      publishedAt: "2026-09-01T12:00:00.000Z",
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
  });

  it("throws instead of producing an Invalid Date for an unparseable publishedAt", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: "hn_2",
        slug: "broken-post",
        publishedAt: "not-a-date",
      }),
    ).toThrow(/unparseable publishedAt/);
  });
});
