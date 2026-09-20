import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC,
  createMediumProvider,
  fetchMediumSyndication,
  mediumProvider,
} from "../../../../../server/integrations/syndication/medium/provider";
import { createTestIntegrationConfig } from "../../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../../server/integrations/testing/loadFixture";
import type {
  FetchMediumArticleInfo,
  ListMediumArticleIds,
  MediumArticleInfo,
} from "../../../../../server/integrations/syndication/medium/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mediumProvider (the default, real-wiring export)", () => {
  it("identifies itself as the medium vendor", () => {
    expect(mediumProvider.vendor).toBe("medium");
  });

  it("returns no rows, without ever consulting the last-synced-at lookup (no DB/network touched), when config has no secret", async () => {
    const config = createTestIntegrationConfig({
      vendor: "medium",
      externalId: "dan-handle",
      secret: null,
    });

    const result = await mediumProvider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
  });
});

describe("createMediumProvider", () => {
  function buildProvider(overrides: {
    lastSuccessfulSyncAt?: Date | null;
    now?: Date;
    listArticleIds?: ListMediumArticleIds;
    fetchArticleInfo?: FetchMediumArticleInfo;
  }) {
    const getLastSuccessfulSyncAt = vi.fn(
      async () => overrides.lastSuccessfulSyncAt ?? null,
    );
    const provider = createMediumProvider({
      getLastSuccessfulSyncAt,
      now: () => overrides.now ?? new Date("2026-09-20T12:00:00Z"),
    });
    return { provider, getLastSuccessfulSyncAt };
  }

  it("emits no rows, silently, when the key is absent — never throws (NAMED ASSUMPTION: unlike Hashnode/DEV.to)", async () => {
    const { provider } = buildProvider({});
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: null,
    });

    await expect(provider.fetch(config)).resolves.toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
  });

  it("emits no rows when no username is configured anywhere", async () => {
    const { provider } = buildProvider({});
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: null,
      secret: "rapidapi_key",
    });

    const result = await provider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
  });

  it("falls back to NUXT_MEDIUM_USERNAME when external_id is unset", async () => {
    vi.stubEnv("NUXT_MEDIUM_USERNAME", "dan-from-env");
    // Not due yet (1h since the last sync, well under the 8h guard) — the
    // fetch never reaches the network, so this test can assert purely on
    // username resolution without stubbing global fetch.
    const { provider, getLastSuccessfulSyncAt } = buildProvider({
      lastSuccessfulSyncAt: new Date("2026-09-20T11:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: null,
      secret: "rapidapi_key",
    });

    await provider.fetch(config);

    expect(getLastSuccessfulSyncAt).toHaveBeenCalledWith("danholloran");
  });

  it("skips the fetch — emits no rows, and never calls the Medium API — when the guard says it isn't due yet", async () => {
    const { provider } = buildProvider({
      lastSuccessfulSyncAt: new Date("2026-09-20T11:00:00Z"), // 1h ago
      now: new Date("2026-09-20T12:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await provider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", originalFetch);
  });

  it("proceeds when the guard says the last successful sync is stale enough", async () => {
    const { provider } = buildProvider({
      lastSuccessfulSyncAt: new Date("2026-09-20T03:00:00Z"), // 9h ago
      now: new Date("2026-09-20T12:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () =>
        url.includes("/user/id_for/")
          ? { id: "user_123" }
          : { associated_articles: [], count: 0 },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await provider.fetch(config);

    expect(fetchSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("fetchMediumSyndication", () => {
  it("normalizes listed article ids + per-article info into syndication_post rows plus a posts count metric", async () => {
    const articleIds = await loadFixture<string[]>(
      "syndication",
      "medium-article-ids",
    );
    const articleInfoById = await loadFixture<
      Record<string, MediumArticleInfo>
    >("syndication", "medium-article-info");
    const listArticleIds: ListMediumArticleIds = vi
      .fn()
      .mockResolvedValue(articleIds);
    const fetchArticleInfo: FetchMediumArticleInfo = vi.fn(
      async (articleId: string) => {
        const info = articleInfoById[articleId];
        if (!info) {
          throw new Error(`No fixture info for article "${articleId}"`);
        }
        return info;
      },
    );

    const result = await fetchMediumSyndication(
      listArticleIds,
      fetchArticleInfo,
    );

    expect(result.metrics).toEqual([
      expect.objectContaining({
        vendor: "medium",
        metric: "posts",
        value: 2,
        period: "current",
      }),
    ]);
    expect(result.syndicationPosts).toEqual([
      {
        platform: "medium",
        postRef: "shipping-a-nuxt-dashboard",
        status: "synced",
        syncedAt: new Date(1798108800000),
      },
      {
        platform: "medium",
        postRef: "landscape-photography-in-iceland",
        status: "synced",
        syncedAt: new Date(1786786500000),
      },
    ]);
  });

  it("bounds per-article detail fetches (and therefore matrix rows) to MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC, while still reporting the platform's TRUE posts count", async () => {
    const totalArticleCount = MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC + 5;
    const manyArticleIds = Array.from(
      { length: totalArticleCount },
      (_, index) => `a${index}`,
    );
    const listArticleIds: ListMediumArticleIds = vi
      .fn()
      .mockResolvedValue(manyArticleIds);
    const fetchArticleInfo: FetchMediumArticleInfo = vi.fn(
      async (articleId: string) => ({
        unique_slug: `${articleId}-1a2b3c4d5e6f`,
        published_at: 1798108800000,
      }),
    );

    const result = await fetchMediumSyndication(
      listArticleIds,
      fetchArticleInfo,
    );

    expect(fetchArticleInfo).toHaveBeenCalledTimes(
      MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC,
    );
    expect(result.syndicationPosts).toHaveLength(
      MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC,
    );
    expect(result.metrics[0]).toMatchObject({
      metric: "posts",
      value: totalArticleCount,
    });
  });
});
