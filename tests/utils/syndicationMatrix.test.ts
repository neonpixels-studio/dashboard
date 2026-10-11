import { describe, expect, it } from "vitest";
import {
  syndicationFailedCount,
  syndicationLivePlatformCount,
  syndicationMatrixPosts,
  syndicationPlatforms,
} from "../../app/utils/syndicationMatrix";
import type { SyndicationMatrixRow } from "../../shared/types/dashboard";

const ROWS: SyndicationMatrixRow[] = [
  {
    postRef: "shipping-a-nuxt-site",
    cells: [
      {
        platform: "medium",
        status: "synced",
        syncedAt: "2026-09-19T00:00:00.000Z",
        views: 1234,
        url: "https://medium.com/@grimicorn/shipping-a-nuxt-site-1a2b3c4d5e6f",
        likes: 1,
        comments: 12,
      },
      {
        platform: "zyvop",
        status: "failed",
        syncedAt: "2026-09-18T00:00:00.000Z",
        views: null,
        // A failed cell never links, even if a URL was stored.
        url: "https://zyvop.com/shipping-a-nuxt-site-abcde",
        likes: null,
        comments: null,
      },
    ],
  },
  {
    postRef: "missouri-ozarks",
    cells: [
      {
        platform: "hashnode",
        status: "pending",
        syncedAt: null,
        views: 0,
        // A queued cell isn't LIVE yet, so a stored URL is not linked.
        url: "https://danholloran.hashnode.dev/missouri-ozarks",
        likes: null,
        comments: 1,
      },
    ],
  },
];

const BASE_URL = "https://danholloran.me";

const NOT_POSTED_CELL = {
  label: "— NOT POSTED",
  tone: "off",
  views: null,
  likes: null,
  comments: null,
  url: null,
};

describe("syndicationPlatforms", () => {
  it("returns every distinct platform across every row, sorted", () => {
    expect(syndicationPlatforms(ROWS)).toEqual(["hashnode", "medium", "zyvop"]);
  });

  it("returns an empty list for no rows", () => {
    expect(syndicationPlatforms([])).toEqual([]);
  });
});

describe("syndicationMatrixPosts", () => {
  it("uses postRef as the title and fills a not-posted cell for a platform the post has no row for", () => {
    const platforms = syndicationPlatforms(ROWS);
    const posts = syndicationMatrixPosts(ROWS, platforms, BASE_URL);

    expect(posts).toHaveLength(2);
    expect(posts[0]!.title).toBe("shipping-a-nuxt-site");
    expect(posts[0]!.cells).toEqual([
      NOT_POSTED_CELL, // hashnode
      {
        label: "✓ LIVE",
        tone: "live",
        views: "1,234 views",
        likes: "1 like",
        comments: "12 comments",
        url: "https://medium.com/@grimicorn/shipping-a-nuxt-site-1a2b3c4d5e6f",
      }, // medium
      // A platform that doesn't report views gets no views line, not "0".
      // A failed cross-post is not LIVE, so it gets no link.
      {
        label: "✗ FAILED",
        tone: "failed",
        views: null,
        likes: null,
        comments: null,
        url: null,
      }, // zyvop
    ]);

    expect(posts[1]!.cells).toEqual([
      // A reported zero is real data and still renders.
      {
        label: "• QUEUED",
        tone: "queued",
        views: "0 views",
        likes: null,
        comments: "1 comment",
        url: null,
      }, // hashnode
      NOT_POSTED_CELL, // medium
      NOT_POSTED_CELL, // zyvop
    ]);
  });

  it("falls back to the not-posted view for a status outside the known enum, rather than rendering undefined", () => {
    // Simulates schema drift (a DB enum value STATUS_VIEWS doesn't know
    // about yet) — cast past the type system the same way a raw, unvalidated
    // API response would arrive.
    const rowWithUnknownStatus = {
      postRef: "future-status",
      cells: [
        {
          platform: "medium",
          status: "archived",
          syncedAt: null,
          views: 5,
          url: "https://medium.com/@grimicorn/future-status",
          likes: 5,
          comments: 5,
        },
      ],
    } as unknown as SyndicationMatrixRow;

    const posts = syndicationMatrixPosts(
      [rowWithUnknownStatus],
      ["medium"],
      BASE_URL,
    );

    expect(posts[0]!.cells).toEqual([NOT_POSTED_CELL]);
  });

  it("percent-encodes a postRef that isn't URL-safe", () => {
    const rows: SyndicationMatrixRow[] = [{ postRef: "a b#c?d", cells: [] }];

    expect(syndicationMatrixPosts(rows, [], BASE_URL)[0]!.url).toBe(
      "https://danholloran.me/posts/a%20b%23c%3Fd",
    );
  });

  it("links each title to the canonical post, tolerating a trailing slash on the base url", () => {
    const withSlash = syndicationMatrixPosts(
      ROWS,
      syndicationPlatforms(ROWS),
      "https://danholloran.me/",
    );

    expect(withSlash.map((post) => post.url)).toEqual([
      "https://danholloran.me/posts/shipping-a-nuxt-site",
      "https://danholloran.me/posts/missouri-ozarks",
    ]);
  });
});

describe("syndicationFailedCount", () => {
  it("counts every failed cell across every post", () => {
    expect(syndicationFailedCount(ROWS)).toBe(1);
  });

  it("returns zero for no failures, never a fabricated count", () => {
    expect(syndicationFailedCount([ROWS[1]!])).toBe(0);
  });
});

describe("syndicationLivePlatformCount", () => {
  it("counts distinct platforms with at least one synced post", () => {
    expect(syndicationLivePlatformCount(ROWS)).toBe(1);
  });

  it("returns zero when nothing has synced", () => {
    expect(syndicationLivePlatformCount([ROWS[1]!])).toBe(0);
  });
});
