import { afterEach, describe, expect, it, vi } from "vitest";
import {
  devtoProvider,
  fetchDevtoSyndication,
} from "../../../../../server/integrations/syndication/devto/provider";
import { createTestIntegrationConfig } from "../../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../../server/integrations/testing/loadFixture";
import type {
  DevtoArticle,
  FetchDevtoArticlesPage,
} from "../../../../../server/integrations/syndication/devto/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("devtoProvider", () => {
  it("identifies itself as the devto vendor", () => {
    expect(devtoProvider.vendor).toBe("devto");
  });

  it("throws when the config has no secret (API key) configured", async () => {
    const config = createTestIntegrationConfig({
      vendor: "devto",
      secret: null,
    });

    await expect(devtoProvider.fetch(config)).rejects.toThrow(
      /no API key configured/,
    );
  });

  it("end-to-end: builds a real DEV.to client from config.secret and returns normalized posts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [
          { id: 1, slug: "a-post", published_at: "2026-09-01T12:00:00Z" },
        ],
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [],
      });
    vi.stubGlobal("fetch", fetchImpl);
    const config = createTestIntegrationConfig({
      slug: "danholloran",
      vendor: "devto",
      secret: "key_abc",
    });

    const result = await devtoProvider.fetch(config);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/articles/me/published"),
      expect.anything(),
    );
    expect(result.metrics[0]).toMatchObject({ metric: "posts", value: 1 });
    expect(result.syndicationPosts[0]).toMatchObject({ postRef: "a-post" });
  });
});

describe("fetchDevtoSyndication", () => {
  it("normalizes a page of articles into syndication_post rows plus a posts count metric", async () => {
    const articles = await loadFixture<DevtoArticle[]>(
      "syndication",
      "devto-two-articles",
    );
    const fetchArticlesPage: FetchDevtoArticlesPage = vi
      .fn()
      .mockResolvedValueOnce(articles)
      .mockResolvedValueOnce([]);

    const result = await fetchDevtoSyndication(fetchArticlesPage);

    expect(result.metrics).toEqual([
      expect.objectContaining({
        vendor: "devto",
        metric: "posts",
        value: 2,
        period: "current",
      }),
    ]);
    expect(result.syndicationPosts).toEqual([
      {
        platform: "devto",
        postRef: "shipping-a-nuxt-dashboard",
        status: "synced",
        syncedAt: new Date("2026-09-01T12:05:00Z"),
      },
      {
        platform: "devto",
        postRef: "landscape-photography-in-iceland",
        status: "synced",
        syncedAt: new Date("2026-08-15T09:35:00Z"),
      },
    ]);
  });

  it("reports a real zero posts count when there are no published articles yet", async () => {
    const fetchArticlesPage: FetchDevtoArticlesPage = vi
      .fn()
      .mockResolvedValue([]);

    const result = await fetchDevtoSyndication(fetchArticlesPage);

    expect(result.metrics[0]).toMatchObject({ metric: "posts", value: 0 });
    expect(result.syndicationPosts).toEqual([]);
  });

  it("stops requesting pages once a short page comes back, without an extra trailing request", async () => {
    const fullPage: DevtoArticle[] = Array.from({ length: 2 }, (_, index) => ({
      id: index,
      slug: `post-${index}`,
      published_at: "2026-09-01T00:00:00Z",
    }));
    const fetchArticlesPage = vi
      .fn()
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([]);

    await fetchDevtoSyndication(fetchArticlesPage);

    expect(fetchArticlesPage).toHaveBeenCalledTimes(2);
    expect(fetchArticlesPage).toHaveBeenNthCalledWith(1, 1);
    expect(fetchArticlesPage).toHaveBeenNthCalledWith(2, 2);
  });

  it("fails loud instead of looping forever if pages never come back short", async () => {
    const fetchArticlesPage: FetchDevtoArticlesPage = vi
      .fn()
      .mockResolvedValue([
        { id: 1, slug: "never-ending", published_at: "2026-09-01T00:00:00Z" },
      ]);

    await expect(fetchDevtoSyndication(fetchArticlesPage)).rejects.toThrow(
      /did not terminate within/,
    );
  });
});
