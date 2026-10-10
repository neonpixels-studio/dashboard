import { describe, expect, it } from "vitest";
import {
  HashnodeIngestValidationError,
  parseHashnodeIngestPayload,
  toHashnodeProviderResult,
} from "../../../../../server/integrations/syndication/hashnode/ingest";

const VALID_POST = {
  slug: "shipping-a-nuxt-dashboard",
  publishedAt: "2026-09-01T12:00:00.000Z",
  views: 120,
};

function payloadWith(posts: unknown[]): unknown {
  return { app: "danholloran", posts };
}

function expectRejected(body: unknown, message: RegExp): void {
  expect(() => parseHashnodeIngestPayload(body)).toThrow(
    HashnodeIngestValidationError,
  );
  expect(() => parseHashnodeIngestPayload(body)).toThrow(message);
}

describe("parseHashnodeIngestPayload", () => {
  it("returns the app and posts for a valid body", () => {
    expect(parseHashnodeIngestPayload(payloadWith([VALID_POST]))).toEqual({
      app: "danholloran",
      posts: [VALID_POST],
    });
  });

  it("accepts an empty post list as a real zero", () => {
    expect(parseHashnodeIngestPayload(payloadWith([]))).toEqual({
      app: "danholloran",
      posts: [],
    });
  });

  it("drops fields it doesn't know about", () => {
    const parsed = parseHashnodeIngestPayload(
      payloadWith([{ ...VALID_POST, title: "Shipping" }]),
    );

    expect(parsed.posts[0]).toEqual(VALID_POST);
  });

  it("rejects a non-object body", () => {
    expectRejected("nope", /Body must be a JSON object/);
    expectRejected([VALID_POST], /Body must be a JSON object/);
  });

  it("rejects a missing or empty app", () => {
    expectRejected({ posts: [] }, /app must be a non-empty string/);
    expectRejected({ app: "", posts: [] }, /app must be a non-empty string/);
  });

  it("rejects a missing posts array", () => {
    expectRejected({ app: "danholloran" }, /posts must be an array/);
  });

  it("rejects more posts than the payload bound allows", () => {
    const posts = Array.from({ length: 1_001 }, (_unused, index) => ({
      ...VALID_POST,
      slug: `post-${index}`,
    }));

    expectRejected(payloadWith(posts), /at most 1000 entries/);
  });

  it("rejects a slug that is a URL, has a trailing slash or uppercase letters", () => {
    for (const slug of [
      "https://grimicorn.hashnode.dev/shipping",
      "shipping/",
      "Shipping",
      "",
    ]) {
      expectRejected(
        payloadWith([{ ...VALID_POST, slug }]),
        /posts\[0\]\.slug must be a lowercase hyphenated Hashnode slug/,
      );
    }
  });

  it("rejects an unparseable publishedAt", () => {
    expectRejected(
      payloadWith([{ ...VALID_POST, publishedAt: "yesterday" }]),
      /posts\[0\]\.publishedAt must be an ISO 8601 date string/,
    );
  });

  it("rejects negative, fractional or non-numeric views", () => {
    for (const views of [-1, 1.5, "120", null]) {
      expectRejected(
        payloadWith([{ ...VALID_POST, views }]),
        /posts\[0\]\.views must be a non-negative integer/,
      );
    }
  });

  it("names the index of the bad post", () => {
    expectRejected(
      payloadWith([VALID_POST, { ...VALID_POST, slug: "other", views: -5 }]),
      /posts\[1\]\.views/,
    );
  });

  it("rejects duplicate slugs, which would double count the posts metric", () => {
    expectRejected(
      payloadWith([VALID_POST, VALID_POST]),
      /duplicate slug "shipping-a-nuxt-dashboard"/,
    );
  });
});

describe("toHashnodeProviderResult", () => {
  it("builds hashnode syndication rows with views plus posts and summed views metrics", () => {
    const result = toHashnodeProviderResult({
      app: "danholloran",
      posts: [
        VALID_POST,
        {
          slug: "landscape-photography-in-iceland",
          publishedAt: "2026-08-15T09:30:00.000Z",
          views: 30,
        },
      ],
    });

    expect(result.metrics).toEqual([
      expect.objectContaining({
        vendor: "hashnode",
        metric: "posts",
        value: 2,
        period: "current",
      }),
      expect.objectContaining({
        vendor: "hashnode",
        metric: "views",
        value: 150,
        period: "current",
      }),
    ]);
    expect(result.syndicationPosts).toEqual([
      {
        platform: "hashnode",
        postRef: "shipping-a-nuxt-dashboard",
        status: "synced",
        syncedAt: new Date("2026-09-01T12:00:00.000Z"),
        views: 120,
      },
      {
        platform: "hashnode",
        postRef: "landscape-photography-in-iceland",
        status: "synced",
        syncedAt: new Date("2026-08-15T09:30:00.000Z"),
        views: 30,
      },
    ]);
  });
});
