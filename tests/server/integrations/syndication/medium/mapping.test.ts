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
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: 1798108800000,
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date(1798108800000),
    });
  });

  it("also handles a bare 'YYYY-MM-DD HH:mm:ss' UTC string published_at (the other documented shape)", () => {
    const post = toSyndicationSourcePost({
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: "2026-09-01 12:00:00",
    });

    expect(post.publishedAt).toEqual(new Date("2026-09-01T12:00:00Z"));
  });

  it("does NOT double-append a timezone marker onto a full ISO 8601 string that already has one", () => {
    const post = toSyndicationSourcePost({
      unique_slug: "shipping-a-nuxt-dashboard-1a2b3c4d5e6f",
      published_at: "2026-09-01T12:00:00.000Z",
    });

    expect(post.publishedAt).toEqual(new Date("2026-09-01T12:00:00.000Z"));
  });

  it("throws instead of producing an Invalid Date for a non-finite published_at", () => {
    expect(() =>
      toSyndicationSourcePost({
        unique_slug: "broken-post-000000000000",
        published_at: Number.NaN,
      }),
    ).toThrow(/unparseable published_at/);
  });

  it("throws instead of producing an Invalid Date for an unparseable published_at string", () => {
    expect(() =>
      toSyndicationSourcePost({
        unique_slug: "broken-post-000000000000",
        published_at: "not-a-date",
      }),
    ).toThrow(/unparseable published_at/);
  });
});
