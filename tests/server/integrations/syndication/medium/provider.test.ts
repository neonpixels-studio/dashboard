import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC,
  createMediumProvider,
  fetchMediumSyndication,
  mediumProvider,
} from "../../../../../server/integrations/syndication/medium/provider";
import { createAbortAwareFetch } from "../../../../../server/integrations/testing/abortAwareFetch";
import { createExhaustedDeadline } from "../../../../../server/integrations/testing/deadlineFixtures";
import { createTestIntegrationConfig } from "../../../../../server/integrations/testing/testConfig";
import { jsonResponse } from "../../../../../server/integrations/testing/httpFixtures";
import { loadFixture } from "../../../../../server/integrations/testing/loadFixture";
import type {
  FetchMediumArticleInfo,
  ListMediumArticleIds,
  MediumArticleInfo,
} from "../../../../../server/integrations/syndication/medium/types";

beforeEach(() => {
  // Every "unconfigured" test below asserts on the ABSENCE of this env var —
  // stub it empty explicitly rather than relying on it happening to be unset
  // in whoever's shell/`.env` runs this suite (see fetchMediumSyndication's
  // own describe block for the tests that stub a real value instead).
  vi.stubEnv("NUXT_MEDIUM_USERNAME", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    lastAttemptedSyncAt?: Date | null;
    knownArticleIds?: string[];
    now?: Date;
  }) {
    const getLastSuccessfulSyncAt = vi.fn(
      async () => overrides.lastSuccessfulSyncAt ?? null,
    );
    const getLastAttemptedSyncAt = vi.fn(
      async () => overrides.lastAttemptedSyncAt ?? null,
    );
    // Defaults to "claimed" (true) — recordSyncAttempt's atomic upsert in
    // persist.ts only returns false when a concurrent call already won this
    // attempt window; that's an explicit per-test override (see the
    // "loses the race" test below), not the common case.
    const recordAttempt = vi.fn(async () => true);
    const getKnownArticleIds = vi.fn(
      async () => new Set(overrides.knownArticleIds ?? []),
    );
    const provider = createMediumProvider({
      getLastSuccessfulSyncAt,
      getLastAttemptedSyncAt,
      recordAttempt,
      getKnownArticleIds,
      now: () => overrides.now ?? new Date("2026-09-20T12:00:00Z"),
    });
    return {
      provider,
      getLastSuccessfulSyncAt,
      getLastAttemptedSyncAt,
      recordAttempt,
      getKnownArticleIds,
    };
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

  it("falls back to NUXT_MEDIUM_USERNAME when external_id is unset, and actually uses it in the request", async () => {
    vi.stubEnv("NUXT_MEDIUM_USERNAME", "dan-from-env");
    const { provider } = buildProvider({
      lastSuccessfulSyncAt: null, // never synced -> always due
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: null,
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ id: "user_123", associated_articles: [] }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await provider.fetch(config);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://medium2.p.rapidapi.com/user/id_for/dan-from-env",
      expect.anything(),
    );
  });

  it("skips the fetch — emits no rows, never calls the Medium API, and never records a new attempt — when the guard says it isn't due yet (last success)", async () => {
    const { provider, recordAttempt, getKnownArticleIds } = buildProvider({
      lastSuccessfulSyncAt: new Date("2026-09-20T11:00:00Z"), // 1h ago
      now: new Date("2026-09-20T12:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await provider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
    expect(getKnownArticleIds).not.toHaveBeenCalled();
  });

  it("only fetches detail for articles this slug has no row for yet", async () => {
    const { provider, getKnownArticleIds } = buildProvider({
      lastSuccessfulSyncAt: null,
      knownArticleIds: ["newest"],
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/user/id_for/")) {
        return jsonResponse({ id: "user_123" });
      }
      if (url.includes("/articles")) {
        return jsonResponse({ associated_articles: ["newest", "older"] });
      }
      return jsonResponse({
        id: "older",
        unique_slug: "an-older-post-1a2b3c4d5e6f",
        published_at: "2026-09-01 12:00:00",
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await provider.fetch(config);

    expect(getKnownArticleIds).toHaveBeenCalledWith("danholloran");
    const requestedUrls = fetchSpy.mock.calls.map(([url]) => url);
    expect(requestedUrls).toContain(
      "https://medium2.p.rapidapi.com/article/older",
    );
    expect(requestedUrls).not.toContain(
      "https://medium2.p.rapidapi.com/article/newest",
    );
    expect(result.syndicationPosts).toEqual([
      expect.objectContaining({
        postRef: "an-older-post",
        externalId: "older",
      }),
    ]);
  });

  it("skips the fetch — emits no rows, never calls the Medium API — when the guard says it isn't due yet because of a recent attempt, even with no prior success (retry-storm regression)", async () => {
    const { provider, recordAttempt } = buildProvider({
      lastSuccessfulSyncAt: null, // never succeeded
      lastAttemptedSyncAt: new Date("2026-09-20T11:55:00Z"), // 5m ago, failed
      now: new Date("2026-09-20T12:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await provider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(recordAttempt).not.toHaveBeenCalled();
  });

  it("proceeds when the guard says the last successful sync is stale enough, and records the attempt watermark before calling the Medium API", async () => {
    const { provider, recordAttempt } = buildProvider({
      lastSuccessfulSyncAt: null, // never synced -> always due
      now: new Date("2026-09-20T12:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const callOrder: string[] = [];
    recordAttempt.mockImplementation(async () => {
      callOrder.push("recordAttempt");
      return true;
    });
    const fetchSpy = vi.fn(async (url: string) => {
      callOrder.push("medium-api");
      return jsonResponse(
        url.includes("/user/id_for/")
          ? { id: "user_123" }
          : { associated_articles: [], count: 0 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    await provider.fetch(config);

    expect(fetchSpy).toHaveBeenCalled();
    expect(recordAttempt).toHaveBeenCalledWith(
      "danholloran",
      new Date("2026-09-20T12:00:00Z"),
    );
    // recordAttempt must be stamped before ANY real Medium API call, however
    // many requests this sync ends up making.
    expect(callOrder[0]).toBe("recordAttempt");
    expect(callOrder.length).toBeGreaterThan(1);
    expect(callOrder.slice(1)).toEqual(
      callOrder.slice(1).map(() => "medium-api"),
    );
  });

  it("proceeds when the last successful sync was long ago and the last attempt (which failed) was also long ago, passing that attempt watermark through to the guard rather than a hardcoded null", async () => {
    const { provider, getLastAttemptedSyncAt, recordAttempt } = buildProvider({
      lastSuccessfulSyncAt: null,
      lastAttemptedSyncAt: new Date("2026-09-19T00:00:00Z"), // >24h before `now`
      now: new Date("2026-09-20T12:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn(async (url: string) =>
      jsonResponse(
        url.includes("/user/id_for/")
          ? { id: "user_123" }
          : { associated_articles: [], count: 0 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await provider.fetch(config);

    expect(getLastAttemptedSyncAt).toHaveBeenCalledWith("danholloran");
    expect(fetchSpy).toHaveBeenCalled();
    expect(recordAttempt).toHaveBeenCalledWith(
      "danholloran",
      new Date("2026-09-20T12:00:00Z"),
    );
  });

  it("still records the attempt watermark even when the Medium API call throws (the retry-storm case this watermark exists to prevent)", async () => {
    const { provider, recordAttempt } = buildProvider({
      lastSuccessfulSyncAt: null,
      now: new Date("2026-09-20T12:00:00Z"),
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchSpy);

    // mediumClient.ts wraps the underlying fetch failure into its own
    // request-failed error rather than rethrowing it verbatim — assert on
    // that wrapped rejection rather than the raw "network down" message.
    await expect(provider.fetch(config)).rejects.toThrow(/request.*failed/);

    expect(recordAttempt).toHaveBeenCalledWith(
      "danholloran",
      new Date("2026-09-20T12:00:00Z"),
    );
  });

  it("never calls the Medium API, and propagates the failure, when persisting the attempt watermark itself fails", async () => {
    // This watermark guards a paid, capped resource (mediumapi.com's
    // 150-requests/month plan) — unlike sync_status's own best-effort
    // bookkeeping writes, a failure here must NOT be swallowed and must NOT
    // let the real Medium call through, or a persistently-failing DB write
    // would look identical to an attempt that was never made and reopen the
    // exact retry-storm hole this guard exists to close.
    const { provider, recordAttempt } = buildProvider({
      lastSuccessfulSyncAt: null,
      now: new Date("2026-09-20T12:00:00Z"),
    });
    recordAttempt.mockRejectedValue(new Error("db unreachable"));
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(provider.fetch(config)).rejects.toThrow("db unreachable");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never calls the Medium API when recordAttempt reports the attempt was already claimed by a concurrent call (lost the race)", async () => {
    // recordSyncAttempt (persist.ts) is an atomic conditional upsert that
    // returns false when another overlapping fetch() already claimed this
    // window — e.g. a scheduled tick racing a manual POST /api/sync. Both
    // calls can read isMediumSyncDue as true, but only one may ever reach
    // the real Medium API for a given window.
    const { provider, recordAttempt } = buildProvider({
      lastSuccessfulSyncAt: null,
      now: new Date("2026-09-20T12:00:00Z"),
    });
    recordAttempt.mockResolvedValue(false);
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await provider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("threads a passed-in deadline through to the real Medium client (issue #62), rather than silently ignoring it", async () => {
    // Proves the wiring, not just fetchJson's own behavior in isolation (see
    // httpClient.test.ts): if createMediumProvider's fetch ever dropped its
    // `deadline` argument on the way to createMediumArticleIdLister, this
    // already-aborted deadline would be ignored and the stubbed fetch below
    // would resolve normally instead of this rejecting.
    const { provider } = buildProvider({
      lastSuccessfulSyncAt: null, // never synced -> always due
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const fetchSpy = createAbortAwareFetch(() =>
      jsonResponse({ id: "user_123" }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      provider.fetch(config, createExhaustedDeadline()),
    ).rejects.toThrow(/shared run budget was exhausted/);
  });

  it("threads the same deadline into the per-article info fetch too, not just the id lister (issue #62)", async () => {
    // The test above proves createMediumArticleIdLister gets `deadline`, but
    // it uses an ALREADY-exhausted deadline, so it fails on the very first
    // request and never proves anything about createMediumArticleInfoFetcher
    // — if that second call site ever dropped its `deadline` argument, this
    // suite would stay green. Here the deadline starts open (both id-lookup
    // requests succeed), then aborts between the id lister finishing and the
    // per-article info fetch starting, so only a provider that actually
    // threads `deadline` all the way through rejects.
    const { provider } = buildProvider({
      lastSuccessfulSyncAt: null, // never synced -> always due
    });
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "medium",
      externalId: "dan-handle",
      secret: "rapidapi_key",
    });
    const controller = new AbortController();
    const deadline = { signal: controller.signal, remainingMs: () => 5_000 };
    let requestCount = 0;
    const fetchStub = vi.fn((_url: unknown, init?: RequestInit) => {
      requestCount += 1;
      if (init?.signal?.aborted) {
        return Promise.reject(
          new DOMException("This operation was aborted", "AbortError"),
        );
      }
      if (requestCount === 1) {
        return Promise.resolve(jsonResponse({ id: "user_123" }));
      }
      // The id lister's second (and last) request. Abort right after it
      // resolves, before fetchMediumSyndication's loop makes its first
      // per-article info request.
      controller.abort(new Error("shared run budget exhausted (test)"));
      return Promise.resolve(
        jsonResponse({ associated_articles: [["article-1"]] }),
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchStub);

    await expect(provider.fetch(config, deadline)).rejects.toThrow(/aborted/i);
    expect(fetchStub).toHaveBeenCalledTimes(3);
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
        views: null,
        externalId: "1a2b3c4d5e6f",
      },
      {
        platform: "medium",
        postRef: "landscape-photography-in-iceland",
        status: "synced",
        syncedAt: new Date(1786786500000),
        views: null,
        externalId: "6f5e4d3c2b1a",
      },
    ]);
  });

  it("fetches article detail sequentially, in id-list order, not concurrently", async () => {
    // Exactly MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC ids — one more would be
    // silently dropped by the bound (covered by its own test below), which
    // would make this test's later assertions fail for an unrelated reason.
    const articleIds = Array.from(
      { length: MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC },
      (_, index) => `a${index}`,
    );
    const listArticleIds: ListMediumArticleIds = vi
      .fn()
      .mockResolvedValue(articleIds);
    const inFlightAtCallTime: number[] = [];
    let inFlight = 0;
    const fetchArticleInfo: FetchMediumArticleInfo = vi.fn(
      async (articleId: string) => {
        inFlight += 1;
        inFlightAtCallTime.push(inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return {
          id: articleId,
          unique_slug: `${articleId}-1a2b3c4d5e6f`,
          published_at: 1798108800000,
        };
      },
    );

    await fetchMediumSyndication(listArticleIds, fetchArticleInfo);

    expect(inFlightAtCallTime).toEqual(articleIds.map(() => 1));
    articleIds.forEach((articleId, index) => {
      expect(fetchArticleInfo).toHaveBeenNthCalledWith(index + 1, articleId);
    });
  });

  it("dedupes two articles that collide onto the same postRef after hash-stripping, keeping the most recently published one", async () => {
    const articleIds = ["older", "newer"];
    const listArticleIds: ListMediumArticleIds = vi
      .fn()
      .mockResolvedValue(articleIds);
    const fetchArticleInfo: FetchMediumArticleInfo = vi.fn(
      async (articleId: string) => ({
        // Both strip down to postRef "weekly-notes" — same title, different
        // Medium articles.
        id: articleId,
        unique_slug: `weekly-notes-${articleId === "older" ? "1a2b3c4d5e" : "6f5e4d3c2b"}`,
        published_at: articleId === "older" ? 1786786500000 : 1798108800000,
      }),
    );

    const result = await fetchMediumSyndication(
      listArticleIds,
      fetchArticleInfo,
    );

    expect(result.syndicationPosts).toHaveLength(1);
    expect(result.syndicationPosts[0]).toMatchObject({
      postRef: "weekly-notes",
      syncedAt: new Date(1798108800000),
    });
  });

  it("skips already-stored articles and backfills the newest unseen ones, still reporting the TRUE posts count", async () => {
    const articleIds = ["a0", "a1", "a2", "a3", "a4"];
    const listArticleIds: ListMediumArticleIds = vi
      .fn()
      .mockResolvedValue(articleIds);
    const fetchArticleInfo: FetchMediumArticleInfo = vi.fn(
      async (articleId: string) => ({
        id: articleId,
        unique_slug: `${articleId}-1a2b3c4d5e6f`,
        published_at: 1798108800000,
      }),
    );

    const result = await fetchMediumSyndication(
      listArticleIds,
      fetchArticleInfo,
      new Set(["a0", "a2"]),
    );

    expect(vi.mocked(fetchArticleInfo).mock.calls).toEqual([["a1"], ["a3"]]);
    expect(result.syndicationPosts.map((post) => post.externalId)).toEqual([
      "a1",
      "a3",
    ]);
    expect(result.metrics[0]).toMatchObject({
      metric: "posts",
      value: articleIds.length,
    });
  });

  it("makes no detail requests once every listed article already has a row", async () => {
    const listArticleIds: ListMediumArticleIds = vi
      .fn()
      .mockResolvedValue(["a0", "a1"]);
    const fetchArticleInfo: FetchMediumArticleInfo = vi.fn();

    const result = await fetchMediumSyndication(
      listArticleIds,
      fetchArticleInfo,
      new Set(["a0", "a1"]),
    );

    expect(fetchArticleInfo).not.toHaveBeenCalled();
    expect(result.syndicationPosts).toEqual([]);
    expect(result.metrics[0]).toMatchObject({ metric: "posts", value: 2 });
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
        id: articleId,
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
