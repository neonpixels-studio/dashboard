import { describe, expect, it } from "vitest";
import {
  toPostRef,
  toSyndicationSourcePost,
} from "../../../../../server/integrations/syndication/medium/mapping";

describe("toPostRef", () => {
  it("strips Medium's trailing per-article hash so the slug matches Hashnode/DEV.to's plain slug", () => {
    expect(toPostRef("shipping-a-nuxt-dashboard-1a2b3c4d5e6f")).toBe(
      "shipping-a-nuxt-dashboard",
    );
  });

  it("falls back to the raw slug when it doesn't end in a 12-hex-char suffix", () => {
    expect(toPostRef("a-slug-with-no-hash-suffix")).toBe(
      "a-slug-with-no-hash-suffix",
    );
  });
});

describe("toSyndicationSourcePost (medium)", () => {
  it("maps an article info response's unique_slug and published_at into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: 1798108800000,
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date(1798108800000),
    });
  });

  it("throws instead of producing an Invalid Date for a non-finite published_at", () => {
    expect(() =>
      toSyndicationSourcePost({
        unique_slug: "broken-post-000000000000",
        published_at: Number.NaN,
      }),
    ).toThrow(/unparseable published_at/);
  });
});
