import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchHashnodeSyndication,
  hashnodeProvider,
  resolvePublicationId,
} from "../../../../../server/integrations/syndication/hashnode/provider";
import { createTestIntegrationConfig } from "../../../../../server/integrations/testing/testConfig";
import { jsonResponse } from "../../../../../server/integrations/testing/httpFixtures";
import { loadFixture } from "../../../../../server/integrations/testing/loadFixture";
import type {
  FetchHashnodePostsPage,
  HashnodePostsPage,
} from "../../../../../server/integrations/syndication/hashnode/types";

beforeEach(() => {
  // The "no publication id configured" tests below assert on the ABSENCE of
  // this env var — stub it empty explicitly rather than relying on it
  // happening to be unset in whoever's shell/`.env` runs this suite.
  vi.stubEnv("NUXT_HASHNODE_PUBLICATION_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hashnodeProvider", () => {
  it("identifies itself as the hashnode vendor", () => {
    expect(hashnodeProvider.vendor).toBe("hashnode");
  });

  it("throws when the config has no secret (personal access token) configured", async () => {
    const config = createTestIntegrationConfig({
      vendor: "hashnode",
      externalId: "pub_123",
      secret: null,
    });

    await expect(hashnodeProvider.fetch(config)).rejects.toThrow(
      /no personal access token configured/,
    );
  });

  it("returns no rows (not zeros) when no publication id is configured anywhere", async () => {
    const config = createTestIntegrationConfig({
      vendor: "hashnode",
      externalId: null,
      secret: "token_abc",
    });

    const result = await hashnodeProvider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
  });

  it("end-to-end: builds a real Hashnode client from config.secret/external_id and returns normalized posts", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          publication: {
            posts: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [
                {
                  node: {
                    id: "hn_1",
                    slug: "a-post",
                    publishedAt: "2026-09-01T12:00:00.000Z",
                  },
                },
              ],
            },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "hashnode",
      externalId: "pub_123",
      secret: "token_abc",
    });

    const result = await hashnodeProvider.fetch(config);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gql.hashnode.com/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.metrics[0]).toMatchObject({ metric: "posts", value: 1 });
    expect(result.syndicationPosts[0]).toMatchObject({ postRef: "a-post" });
  });
});

describe("resolvePublicationId", () => {
  it("falls back to NUXT_HASHNODE_PUBLICATION_ID when external_id is unset", () => {
    vi.stubEnv("NUXT_HASHNODE_PUBLICATION_ID", "pub_from_env");
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "hashnode",
      externalId: null,
    });

    expect(resolvePublicationId(config)).toBe("pub_from_env");
  });

  it("prefers integration_config.external_id over the env var when both are set", () => {
    vi.stubEnv("NUXT_HASHNODE_PUBLICATION_ID", "pub_from_env");
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "hashnode",
      externalId: "pub_from_row",
    });

    expect(resolvePublicationId(config)).toBe("pub_from_row");
  });

  it("returns null (not a blank string) when neither source is set", () => {
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "hashnode",
      externalId: "   ",
    });

    expect(resolvePublicationId(config)).toBeNull();
  });
});

describe("fetchHashnodeSyndication", () => {
  function buildFixtureFetcher(
    ...pages: HashnodePostsPage[]
  ): FetchHashnodePostsPage {
    const fetchPage = vi.fn();
    pages.forEach((page) => fetchPage.mockResolvedValueOnce(page));
    return fetchPage;
  }

  it("normalizes a page of posts into syndication_post rows plus a posts count metric", async () => {
    const page = await loadFixture<HashnodePostsPage>(
      "syndication",
      "hashnode-two-posts",
    );
    const fetchPostsPage = buildFixtureFetcher(page);

    const result = await fetchHashnodeSyndication(fetchPostsPage);

    expect(result.metrics).toEqual([
      expect.objectContaining({
        vendor: "hashnode",
        metric: "posts",
        value: 2,
        period: "current",
      }),
    ]);
    expect(result.syndicationPosts).toEqual([
      {
        platform: "hashnode",
        postRef: "shipping-a-nuxt-dashboard",
        status: "synced",
        syncedAt: new Date("2026-09-01T12:00:00.000Z"),
      },
      {
        platform: "hashnode",
        postRef: "landscape-photography-in-iceland",
        status: "synced",
        syncedAt: new Date("2026-08-15T09:30:00.000Z"),
      },
    ]);
    expect(result.trafficBreakdown).toEqual([]);
  });

  it("reports a real zero posts count for a publication with no posts yet", async () => {
    const page = await loadFixture<HashnodePostsPage>(
      "syndication",
      "hashnode-empty",
    );
    const fetchPostsPage = buildFixtureFetcher(page);

    const result = await fetchHashnodeSyndication(fetchPostsPage);

    expect(result.metrics[0]).toMatchObject({ metric: "posts", value: 0 });
    expect(result.syndicationPosts).toEqual([]);
  });

  it("walks every page until hasNextPage is false", async () => {
    const firstPage: HashnodePostsPage = {
      nodes: [
        { id: "hn_1", slug: "post-one", publishedAt: "2026-09-01T00:00:00Z" },
      ],
      hasNextPage: true,
      endCursor: "cursor_2",
    };
    const secondPage: HashnodePostsPage = {
      nodes: [
        { id: "hn_2", slug: "post-two", publishedAt: "2026-08-01T00:00:00Z" },
      ],
      hasNextPage: false,
      endCursor: null,
    };
    const fetchPostsPage = buildFixtureFetcher(firstPage, secondPage);

    const result = await fetchHashnodeSyndication(fetchPostsPage);

    expect(fetchPostsPage).toHaveBeenNthCalledWith(1, null);
    expect(fetchPostsPage).toHaveBeenNthCalledWith(2, "cursor_2");
    expect(result.syndicationPosts).toHaveLength(2);
  });

  it("fails loud instead of looping forever if hasNextPage never turns false", async () => {
    const foreverPage: HashnodePostsPage = {
      nodes: [],
      hasNextPage: true,
      endCursor: "cursor_forever",
    };
    const fetchPostsPage = vi.fn(async () => foreverPage);

    await expect(fetchHashnodeSyndication(fetchPostsPage)).rejects.toThrow(
      /did not terminate within/,
    );
  });

  it("fails loud instead of re-requesting the first page forever when hasNextPage is true with no endCursor", async () => {
    const selfContradictoryPage: HashnodePostsPage = {
      nodes: [
        { id: "hn_1", slug: "post-one", publishedAt: "2026-09-01T00:00:00Z" },
      ],
      hasNextPage: true,
      endCursor: null,
    };
    const fetchPostsPage = vi.fn(async () => selfContradictoryPage);

    await expect(fetchHashnodeSyndication(fetchPostsPage)).rejects.toThrow(
      /no endCursor/,
    );
    expect(fetchPostsPage).toHaveBeenCalledTimes(1);
  });
});
