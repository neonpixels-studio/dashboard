import { describe, expect, it, vi } from "vitest";
import { createZyvopPostsPageFetcher } from "../../../../../server/integrations/syndication/zyvop/zyvopClient";
import { jsonResponse } from "../../../../../server/integrations/testing/httpFixtures";

function toolResult(payload: unknown, isError = false) {
  return {
    jsonrpc: "2.0",
    id: 0,
    result: {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError,
    },
  };
}

describe("createZyvopPostsPageFetcher", () => {
  it("calls zyvop_list_posts over JSON-RPC with the bearer token, published filter and offset", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(toolResult({ posts: [] })),
    );
    const fetchPostsPage = createZyvopPostsPageFetcher("zv_abc", fetchImpl);

    await fetchPostsPage(50);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://zyvop.com/mcp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer zv_abc" }),
      }),
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toMatchObject({
      method: "tools/call",
      params: {
        name: "zyvop_list_posts",
        arguments: { status: "PUBLISHED", limit: 50, offset: 50 },
      },
    });
  });

  it("returns the posts parsed out of the tool's text content", async () => {
    const posts = [
      { id: "1", slug: "a-post-aaaaa", publishedAt: "2026-09-01T00:00:00Z" },
    ];
    const fetchImpl = vi.fn(async () => jsonResponse(toolResult({ posts })));
    const fetchPostsPage = createZyvopPostsPageFetcher("zv_abc", fetchImpl);

    await expect(fetchPostsPage(0)).resolves.toEqual(posts);
  });

  it("throws when the tool call reports isError on a 2xx response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(toolResult({ error: "limit must be an integer" }, true)),
    );
    const fetchPostsPage = createZyvopPostsPageFetcher("zv_abc", fetchImpl);

    await expect(fetchPostsPage(0)).rejects.toThrow(
      /zyvop_list_posts failed: .*limit must be an integer/,
    );
  });

  it("throws on a JSON-RPC error body, e.g. a rejected token", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message: "Missing or invalid ZyVOP developer token",
        },
      }),
    );
    const fetchPostsPage = createZyvopPostsPageFetcher("zv_bad", fetchImpl);

    await expect(fetchPostsPage(0)).rejects.toThrow(
      /JSON-RPC error -32001: Missing or invalid/,
    );
  });

  it("throws when the HTTP response is not ok", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 401));
    const fetchPostsPage = createZyvopPostsPageFetcher("zv_bad", fetchImpl);

    await expect(fetchPostsPage(0)).rejects.toThrow(/responded with 401/);
  });
});
