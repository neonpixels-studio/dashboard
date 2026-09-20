import { describe, expect, it, vi } from "vitest";
import { createSentryIssueSearcher } from "../../../../server/integrations/sentry/sentryClient";

function buildFetchStub(response: {
  ok: boolean;
  status: number;
  body: unknown;
  linkHeader?: string | null;
}) {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "link" ? (response.linkHeader ?? null) : null,
    },
  })) as unknown as typeof fetch;
}

describe("createSentryIssueSearcher", () => {
  it("requests the project's issue-search endpoint with the query and Authorization header", async () => {
    const fetchStub = buildFetchStub({ ok: true, status: 200, body: [] });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await searchSentryIssues({
      projectSlug: "markpost",
      query: "is:unresolved",
    });

    const [requestedUrl, requestInit] = fetchStub.mock.calls[0] ?? [];
    expect((requestedUrl as URL).toString()).toBe(
      "https://sentry.io/api/0/projects/acme/markpost/issues/?query=is%3Aunresolved",
    );
    expect(requestInit).toMatchObject({
      headers: { Authorization: "Bearer token_abc" },
    });
  });

  it("includes the cursor query param when one is passed", async () => {
    const fetchStub = buildFetchStub({ ok: true, status: 200, body: [] });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await searchSentryIssues({
      projectSlug: "markpost",
      query: "is:unresolved",
      cursor: "0:100:0",
    });

    const requestedUrl = fetchStub.mock.calls[0]?.[0] as URL;
    expect(requestedUrl.searchParams.get("cursor")).toBe("0:100:0");
  });

  it("omits the cursor query param on the first page", async () => {
    const fetchStub = buildFetchStub({ ok: true, status: 200, body: [] });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await searchSentryIssues({
      projectSlug: "markpost",
      query: "is:unresolved",
    });

    const requestedUrl = fetchStub.mock.calls[0]?.[0] as URL;
    expect(requestedUrl.searchParams.has("cursor")).toBe(false);
  });

  it("maps the raw JSON array into plain SentryIssue objects and derives hasMore/nextCursor from the Link header", async () => {
    const fetchStub = buildFetchStub({
      ok: true,
      status: 200,
      body: [{ id: "issue_1" }, { id: "issue_2" }],
      linkHeader:
        '<url>; rel="previous"; results="false"; cursor="0:0:1", <url>; rel="next"; results="true"; cursor="0:100:0"',
    });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    const page = await searchSentryIssues({
      projectSlug: "markpost",
      query: "is:unresolved",
    });

    expect(page).toEqual({
      issues: [{ id: "issue_1" }, { id: "issue_2" }],
      hasMore: true,
      nextCursor: "0:100:0",
    });
  });

  it("reports hasMore false and a null cursor on the last page", async () => {
    const fetchStub = buildFetchStub({
      ok: true,
      status: 200,
      body: [{ id: "issue_1" }],
      linkHeader:
        '<url>; rel="previous"; results="true"; cursor="0:0:1", <url>; rel="next"; results="false"; cursor="0:100:0"',
    });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    const page = await searchSentryIssues({
      projectSlug: "markpost",
      query: "is:unresolved",
    });

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("throws with the status code when Sentry responds with a non-ok status", async () => {
    const fetchStub = buildFetchStub({ ok: false, status: 401, body: {} });
    const searchSentryIssues = createSentryIssueSearcher(
      "bad_token",
      "acme",
      fetchStub,
    );

    await expect(
      searchSentryIssues({ projectSlug: "markpost", query: "is:unresolved" }),
    ).rejects.toThrow(/failed with status 401/);
  });

  it("throws when the response body isn't a JSON array", async () => {
    const fetchStub = buildFetchStub({
      ok: true,
      status: 200,
      body: { detail: "not an array" },
    });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await expect(
      searchSentryIssues({ projectSlug: "markpost", query: "is:unresolved" }),
    ).rejects.toThrow(/non-array response body/);
  });

  it("fails loud instead of silently dropping a malformed issue row", async () => {
    const fetchStub = buildFetchStub({
      ok: true,
      status: 200,
      body: [{ id: "issue_1" }, { notAnId: true }],
    });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await expect(
      searchSentryIssues({ projectSlug: "markpost", query: "is:unresolved" }),
    ).rejects.toThrow(/missing a string "id" field/);
  });
});
