import { describe, expect, it, vi } from "vitest";
import {
  createMediumArticleIdLister,
  createMediumArticleInfoFetcher,
} from "../../../../../server/integrations/syndication/medium/mediumClient";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

describe("createMediumArticleIdLister", () => {
  it("resolves the username to a user id, then flattens the paged article ids", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "user_123" }))
      .mockResolvedValueOnce(
        jsonResponse({
          associated_articles: [["article_1", "article_2"], ["article_3"]],
          count: 3,
        }),
      );
    const listArticleIds = createMediumArticleIdLister(
      "dan-handle",
      "rapidapi_key",
      fetchImpl,
    );

    const articleIds = await listArticleIds();

    expect(articleIds).toEqual(["article_1", "article_2", "article_3"]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://medium2.p.rapidapi.com/user/id_for/dan-handle",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-rapidapi-key": "rapidapi_key",
          "x-rapidapi-host": "medium2.p.rapidapi.com",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://medium2.p.rapidapi.com/user/user_123/articles",
      expect.anything(),
    );
  });

  it("throws when the id_for lookup response is not ok", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 404));
    const listArticleIds = createMediumArticleIdLister(
      "unknown-handle",
      "rapidapi_key",
      fetchImpl,
    );

    await expect(listArticleIds()).rejects.toThrow(/responded with 404/);
  });
});

describe("createMediumArticleInfoFetcher", () => {
  it("requests one article's info by id", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        unique_slug: "a-post-1a2b3c4d5e6f",
        published_at: 1798108800000,
      }),
    );
    const fetchArticleInfo = createMediumArticleInfoFetcher(
      "rapidapi_key",
      fetchImpl,
    );

    const info = await fetchArticleInfo("article_1");

    expect(info).toEqual({
      unique_slug: "a-post-1a2b3c4d5e6f",
      published_at: 1798108800000,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://medium2.p.rapidapi.com/article/article_1",
      expect.anything(),
    );
  });
});
