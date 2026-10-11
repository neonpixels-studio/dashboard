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

  it("strips a shorter (10-hex-char) hash suffix too, not only a 12-char one", () => {
    expect(toPostRef("an-older-post-1a2b3c4d5e")).toBe("an-older-post");
  });

  it("falls back to the raw slug when it doesn't end in a hex-only suffix", () => {
    expect(toPostRef("a-slug-with-no-hash-suffix")).toBe(
      "a-slug-with-no-hash-suffix",
    );
  });

  it("does NOT strip a slug that legitimately ends in a hex-looking number (avoids merging unrelated posts)", () => {
    // "20252026" is 8 hex-safe digits — shorter than the 10-12 char window
    // this pattern targets, so it must survive untouched.
    expect(toPostRef("year-in-review-20252026")).toBe(
      "year-in-review-20252026",
    );
  });
});

describe("toSyndicationSourcePost (medium)", () => {
  it("maps an article info response's unique_slug and an epoch-milliseconds published_at into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: "1a2b3c4d5e6f",
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: 1798108800000,
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date(1798108800000),
      externalId: "1a2b3c4d5e6f",
    });
  });

  it("carries the article's view count when it is a non-negative integer", () => {
    const post = toSyndicationSourcePost({
      id: "1a2b3c4d5e6f",
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: 1798108800000,
      views: 0,
    });

    expect(post.views).toBe(0);
  });

  it("omits views rather than storing a missing or malformed count", () => {
    for (const views of [undefined, -1, 1.5, "12"]) {
      const post = toSyndicationSourcePost({
        id: "1a2b3c4d5e6f",
        unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
        published_at: 1798108800000,
        views: views as number | undefined,
      });

      expect(post).not.toHaveProperty("views");
    }
  });

  it("carries url, claps as likes and responses_count as comments from the same response", () => {
    const post = toSyndicationSourcePost({
      id: "1a2b3c4d5e6f",
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: 1798108800000,
      url: "https://medium.com/@grimicorn/shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      claps: 603,
      responses_count: 0,
    });

    expect(post).toMatchObject({
      url: "https://medium.com/@grimicorn/shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      likes: 603,
      comments: 0,
    });
  });

  it("omits url, likes and comments when missing or malformed", () => {
    for (const bad of [undefined, -1, 1.5, "12", "ftp://x", "https://"]) {
      const post = toSyndicationSourcePost({
        id: "1a2b3c4d5e6f",
        unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
        published_at: 1798108800000,
        url: bad as string | undefined,
        claps: bad as number | undefined,
        responses_count: bad as number | undefined,
      });

      expect(post).not.toHaveProperty("url");
      expect(post).not.toHaveProperty("likes");
      expect(post).not.toHaveProperty("comments");
    }
  });

  it("also handles a bare 'YYYY-MM-DD HH:mm:ss' UTC string published_at (the other documented shape)", () => {
    const post = toSyndicationSourcePost({
      id: "1a2b3c4d5e6f",
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: "2026-09-01 12:00:00",
    });

    expect(post.publishedAt).toEqual(new Date("2026-09-01T12:00:00Z"));
  });

  it("does NOT double-append a timezone marker onto a full ISO 8601 string that already has one", () => {
    const post = toSyndicationSourcePost({
      id: "1a2b3c4d5e6f",
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: "2026-09-01T12:00:00.000Z",
    });

    expect(post.publishedAt).toEqual(new Date("2026-09-01T12:00:00.000Z"));
  });

  it("throws instead of producing an Invalid Date for a non-finite published_at", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: "000000000000",
        unique_slug: "broken-post-000000000000",
        published_at: Number.NaN,
      }),
    ).toThrow(/unparseable published_at/);
  });

  it("throws instead of producing an Invalid Date for an unparseable published_at string", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: "000000000000",
        unique_slug: "broken-post-000000000000",
        published_at: "not-a-date",
      }),
    ).toThrow(/unparseable published_at/);
  });
});
