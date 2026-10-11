import { describe, expect, it } from "vitest";
import {
  toPostRef,
  toSyndicationSourcePost,
} from "../../../../../server/integrations/syndication/zyvop/mapping";

describe("toPostRef (zyvop)", () => {
  it("strips ZyVOP's 5-character slug suffix", () => {
    expect(toPostRef("shipping-a-nuxt-dashboard-446os")).toBe(
      "shipping-a-nuxt-dashboard",
    );
  });
});

describe("toSyndicationSourcePost (zyvop)", () => {
  it("maps a ZyVOP post's slug, publishedAt and views into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: "c4a1ea6f-e480-46ce-91bd-388d319b6e8b",
      slug: "shipping-a-nuxt-dashboard-b0wvr",
      publishedAt: "2026-10-09T10:13:07.261Z",
      views: 3,
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date("2026-10-09T10:13:07.261Z"),
      views: 3,
    });
  });

  it("carries url and likes when the tool returns them", () => {
    const post = toSyndicationSourcePost({
      id: "c4a1ea6f-e480-46ce-91bd-388d319b6e8b",
      slug: "shipping-a-nuxt-dashboard-b0wvr",
      publishedAt: "2026-10-09T10:13:07.261Z",
      views: 3,
      url: "https://zyvop.com/shipping-a-nuxt-dashboard-b0wvr",
      likes: 0,
    });

    expect(post).toMatchObject({
      url: "https://zyvop.com/shipping-a-nuxt-dashboard-b0wvr",
      likes: 0,
    });
    expect(post).not.toHaveProperty("comments");
  });

  it("omits malformed url and likes", () => {
    const post = toSyndicationSourcePost({
      id: "x",
      slug: "shipping-a-nuxt-dashboard-b0wvr",
      publishedAt: "2026-10-09T10:13:07.261Z",
      views: 3,
      url: "/relative/path",
      likes: 1.5,
    });

    expect(post).not.toHaveProperty("url");
    expect(post).not.toHaveProperty("likes");
  });

  it("throws instead of producing an Invalid Date for an unparseable publishedAt", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: "broken",
        slug: "broken-post-aaaaa",
        publishedAt: "",
        views: 0,
      }),
    ).toThrow(/unparseable publishedAt/);
  });
});
