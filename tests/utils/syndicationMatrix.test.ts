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
      },
      {
        platform: "zyvop",
        status: "failed",
        syncedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
  },
  {
    postRef: "missouri-ozarks",
    cells: [{ platform: "hashnode", status: "pending", syncedAt: null }],
  },
];

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
    const posts = syndicationMatrixPosts(ROWS, platforms);

    expect(posts).toHaveLength(2);
    expect(posts[0]!.title).toBe("shipping-a-nuxt-site");
    expect(posts[0]!.cells).toEqual([
      { label: "— NOT POSTED", tone: "off" }, // hashnode
      { label: "✓ LIVE", tone: "live" }, // medium
      { label: "✗ FAILED", tone: "failed" }, // zyvop
    ]);

    expect(posts[1]!.cells).toEqual([
      { label: "• QUEUED", tone: "queued" }, // hashnode
      { label: "— NOT POSTED", tone: "off" }, // medium
      { label: "— NOT POSTED", tone: "off" }, // zyvop
    ]);
  });

  it("falls back to the not-posted view for a status outside the known enum, rather than rendering undefined", () => {
    // Simulates schema drift (a DB enum value STATUS_VIEWS doesn't know
    // about yet) — cast past the type system the same way a raw, unvalidated
    // API response would arrive.
    const rowWithUnknownStatus = {
      postRef: "future-status",
      cells: [{ platform: "medium", status: "archived", syncedAt: null }],
    } as unknown as SyndicationMatrixRow;

    const posts = syndicationMatrixPosts([rowWithUnknownStatus], ["medium"]);

    expect(posts[0]!.cells).toEqual([{ label: "— NOT POSTED", tone: "off" }]);
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
