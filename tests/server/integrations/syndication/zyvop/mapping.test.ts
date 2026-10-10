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
  it("maps a ZyVOP post's slug and publishedAt into a SyndicationSourcePost", () => {
    const post = toSyndicationSourcePost({
      id: "c4a1ea6f-e480-46ce-91bd-388d319b6e8b",
      slug: "shipping-a-nuxt-dashboard-b0wvr",
      publishedAt: "2026-10-09T10:13:07.261Z",
    });

    expect(post).toEqual({
      postRef: "shipping-a-nuxt-dashboard",
      publishedAt: new Date("2026-10-09T10:13:07.261Z"),
    });
  });

  it("throws instead of producing an Invalid Date for an unparseable publishedAt", () => {
    expect(() =>
      toSyndicationSourcePost({
        id: "broken",
        slug: "broken-post-aaaaa",
        publishedAt: "",
      }),
    ).toThrow(/unparseable publishedAt/);
  });
});
