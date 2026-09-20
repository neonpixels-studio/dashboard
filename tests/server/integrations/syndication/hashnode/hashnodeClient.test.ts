import { describe, expect, it, vi } from "vitest";
import { createHashnodePostsPageFetcher } from "../../../../../server/integrations/syndication/hashnode/hashnodeClient";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

describe("createHashnodePostsPageFetcher", () => {
  it("POSTs the publication id, page size, and cursor to Hashnode's GraphQL endpoint with the token as Authorization", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          publication: {
            posts: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [],
            },
          },
        },
      }),
    );
    const fetchPostsPage = createHashnodePostsPageFetcher(
      "pub_123",
      "token_abc",
      fetchImpl,
    );

    await fetchPostsPage("cursor_1");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gql.hashnode.com/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "token_abc",
          "Content-Type": "application/json",
        }),
      }),
    );
    const [, requestInit] = fetchImpl.mock.calls[0] ?? [];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.variables).toEqual({
      publicationId: "pub_123",
      first: 20,
      after: "cursor_1",
    });
  });

  it("maps the response into nodes/hasNextPage/endCursor", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          publication: {
            posts: {
              pageInfo: { hasNextPage: true, endCursor: "cursor_2" },
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
    const fetchPostsPage = createHashnodePostsPageFetcher(
      "pub_123",
      "token_abc",
      fetchImpl,
    );

    const page = await fetchPostsPage(null);

    expect(page).toEqual({
      nodes: [
        {
          id: "hn_1",
          slug: "a-post",
          publishedAt: "2026-09-01T12:00:00.000Z",
        },
      ],
      hasNextPage: true,
      endCursor: "cursor_2",
    });
  });

  it("throws when the HTTP response is not ok", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 401));
    const fetchPostsPage = createHashnodePostsPageFetcher(
      "pub_123",
      "bad_token",
      fetchImpl,
    );

    await expect(fetchPostsPage(null)).rejects.toThrow(/responded with 401/);
  });

  it("throws when the GraphQL response carries errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "publication not found" }] }),
    );
    const fetchPostsPage = createHashnodePostsPageFetcher(
      "pub_missing",
      "token_abc",
      fetchImpl,
    );

    await expect(fetchPostsPage(null)).rejects.toThrow(/publication not found/);
  });

  it("throws when the publication itself is missing from the response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: {} }));
    const fetchPostsPage = createHashnodePostsPageFetcher(
      "pub_missing",
      "token_abc",
      fetchImpl,
    );

    await expect(fetchPostsPage(null)).rejects.toThrow(
      /publication "pub_missing" was not found/,
    );
  });
});
