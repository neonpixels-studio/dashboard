import { describe, expect, it, vi } from "vitest";
import { createDevtoArticlesPageFetcher } from "../../../../../server/integrations/syndication/devto/devtoClient";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

describe("createDevtoArticlesPageFetcher", () => {
  it("requests /articles/me/published with the page number, per_page, and api-key header", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const fetchArticlesPage = createDevtoArticlesPageFetcher(
      "key_abc",
      fetchImpl,
    );

    await fetchArticlesPage(2);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dev.to/api/articles/me/published?page=2&per_page=100",
      expect.objectContaining({
        headers: { "api-key": "key_abc" },
      }),
    );
  });

  it("returns the parsed article array", async () => {
    const articles = [
      { id: 1, slug: "a", published_at: "2026-09-01T00:00:00Z" },
    ];
    const fetchImpl = vi.fn(async () => jsonResponse(articles));
    const fetchArticlesPage = createDevtoArticlesPageFetcher(
      "key_abc",
      fetchImpl,
    );

    const result = await fetchArticlesPage(1);

    expect(result).toEqual(articles);
  });

  it("throws when the HTTP response is not ok", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 401));
    const fetchArticlesPage = createDevtoArticlesPageFetcher(
      "bad_key",
      fetchImpl,
    );

    await expect(fetchArticlesPage(1)).rejects.toThrow(/responded with 401/);
  });
});
