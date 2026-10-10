import { afterEach, describe, expect, it, vi } from "vitest";
import { POSTS_PAGE_SIZE } from "../../../../../server/integrations/syndication/zyvop/zyvopClient";
import {
  fetchZyvopSyndication,
  zyvopProvider,
} from "../../../../../server/integrations/syndication/zyvop/provider";
import { createAbortAwareFetch } from "../../../../../server/integrations/testing/abortAwareFetch";
import { createExhaustedDeadline } from "../../../../../server/integrations/testing/deadlineFixtures";
import { createTestIntegrationConfig } from "../../../../../server/integrations/testing/testConfig";
import { jsonResponse } from "../../../../../server/integrations/testing/httpFixtures";
import { loadFixture } from "../../../../../server/integrations/testing/loadFixture";
import type {
  FetchZyvopPostsPage,
  ZyvopPost,
} from "../../../../../server/integrations/syndication/zyvop/types";

function postsPage(length: number, slugPrefix = "post"): ZyvopPost[] {
  return Array.from({ length }, (_, index) => ({
    id: `${slugPrefix}-${index}`,
    slug: `${slugPrefix}-${index}-aaaaa`,
    publishedAt: "2026-09-01T00:00:00Z",
  }));
}

function listPostsResponse(posts: ZyvopPost[]): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id: 0,
    result: {
      content: [{ type: "text", text: JSON.stringify({ posts }) }],
      isError: false,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("zyvopProvider", () => {
  it("identifies itself as the zyvop vendor", () => {
    expect(zyvopProvider.vendor).toBe("zyvop");
  });

  it("throws when the config has no developer token configured", async () => {
    const config = createTestIntegrationConfig({
      vendor: "zyvop",
      secret: null,
    });

    await expect(zyvopProvider.fetch(config)).rejects.toThrow(
      /no developer token configured/,
    );
  });

  it("end-to-end: builds a real ZyVOP client from config.secret and returns normalized posts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(listPostsResponse(postsPage(1, "a-post")));
    vi.stubGlobal("fetch", fetchImpl);
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "zyvop",
      secret: "zv_abc",
    });

    const result = await zyvopProvider.fetch(config);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://zyvop.com/mcp",
      expect.anything(),
    );
    expect(result.metrics[0]).toMatchObject({ metric: "posts", value: 1 });
    expect(result.syndicationPosts[0]).toMatchObject({
      platform: "zyvop",
      postRef: "a-post-0",
    });
  });

  it("threads a passed-in deadline through to the real ZyVOP client", async () => {
    const fetchImpl = createAbortAwareFetch(() => listPostsResponse([]));
    vi.stubGlobal("fetch", fetchImpl);
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "zyvop",
      secret: "zv_abc",
    });

    await expect(
      zyvopProvider.fetch(config, createExhaustedDeadline()),
    ).rejects.toThrow(/shared run budget was exhausted/);
  });
});

describe("fetchZyvopSyndication", () => {
  it("normalizes posts into suffix-stripped syndication_post rows with views, plus posts and summed views metrics", async () => {
    const posts = await loadFixture<ZyvopPost[]>(
      "syndication",
      "zyvop-two-posts",
    );
    const fetchPostsPage: FetchZyvopPostsPage = vi
      .fn()
      .mockResolvedValueOnce(posts);

    const result = await fetchZyvopSyndication(fetchPostsPage);

    expect(result.metrics).toEqual([
      expect.objectContaining({
        vendor: "zyvop",
        metric: "posts",
        value: 2,
        period: "current",
      }),
      expect.objectContaining({
        vendor: "zyvop",
        metric: "views",
        value: 13,
        period: "current",
      }),
    ]);
    expect(result.syndicationPosts).toEqual([
      {
        platform: "zyvop",
        postRef: "map-getorinsert-stop-writing-the-has-get-set-dance",
        status: "synced",
        fetchedAt: expect.any(Date),
        syncedAt: new Date("2026-10-09T10:13:07.261Z"),
        views: 3,
        externalId: null,
      },
      {
        platform: "zyvop",
        postRef:
          "astro-live-content-collections-fresh-cms-data-without-a-rebuild",
        status: "synced",
        fetchedAt: expect.any(Date),
        syncedAt: new Date("2026-10-06T10:13:01.440Z"),
        views: 10,
        externalId: null,
      },
    ]);
  });

  it("reports a real zero posts count when nothing is published yet", async () => {
    const fetchPostsPage: FetchZyvopPostsPage = vi.fn().mockResolvedValue([]);

    const result = await fetchZyvopSyndication(fetchPostsPage);

    expect(result.metrics[0]).toMatchObject({ metric: "posts", value: 0 });
    expect(result.syndicationPosts).toEqual([]);
  });

  it("advances the offset by POSTS_PAGE_SIZE while pages come back full", async () => {
    const fetchPostsPage = vi
      .fn()
      .mockResolvedValueOnce(postsPage(POSTS_PAGE_SIZE))
      .mockResolvedValueOnce(postsPage(1, "final"));

    const result = await fetchZyvopSyndication(fetchPostsPage);

    expect(fetchPostsPage).toHaveBeenCalledTimes(2);
    expect(fetchPostsPage).toHaveBeenNthCalledWith(1, 0);
    expect(fetchPostsPage).toHaveBeenNthCalledWith(2, POSTS_PAGE_SIZE);
    expect(result.syndicationPosts).toHaveLength(POSTS_PAGE_SIZE + 1);
  });

  it("fails loud instead of looping forever if pages never come back short", async () => {
    const fetchPostsPage: FetchZyvopPostsPage = vi
      .fn()
      .mockResolvedValue(postsPage(POSTS_PAGE_SIZE));

    await expect(fetchZyvopSyndication(fetchPostsPage)).rejects.toThrow(
      /did not terminate within/,
    );
  });
});
