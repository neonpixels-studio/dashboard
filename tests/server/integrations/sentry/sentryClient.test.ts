import { afterEach, describe, expect, it, vi } from "vitest";
import { createSentryIssueSearcher } from "../../../../server/integrations/sentry/sentryClient";

// A real Sentry response always carries a Link header with a "next" entry
// (see mapping.ts's parseSentryNextCursor) — this is the default "last page,
// no more results" shape so tests that don't care about pagination don't
// have to spell it out every time. Pass an explicit `linkHeader` (including
// `null`, to simulate a genuinely missing header) to override it.
const DEFAULT_LAST_PAGE_LINK_HEADER =
  '<url>; rel="next"; results="false"; cursor="0:0:1"';

afterEach(() => {
  vi.useRealTimers();
});

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
      get: (name: string) => {
        if (name.toLowerCase() !== "link") {
          return null;
        }
        // Distinguishes "not specified by this test" (use the default) from
        // an explicit `linkHeader: null` (simulate a genuinely missing
        // header) — `??` would collapse both to the default.
        return response.linkHeader === undefined
          ? DEFAULT_LAST_PAGE_LINK_HEADER
          : response.linkHeader;
      },
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

  it("throws a project-identified error when a 200 response body isn't valid JSON", async () => {
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
      headers: { get: () => null },
    })) as unknown as typeof fetch;
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await expect(
      searchSentryIssues({ projectSlug: "markpost", query: "is:unresolved" }),
    ).rejects.toThrow(/markpost.*non-JSON response body/);
  });

  it("fails loud when a real (ok, array-body) response has no Link header at all", async () => {
    const fetchStub = buildFetchStub({
      ok: true,
      status: 200,
      body: [{ id: "issue_1" }],
      linkHeader: null,
    });
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await expect(
      searchSentryIssues({ projectSlug: "markpost", query: "is:unresolved" }),
    ).rejects.toThrow(/no Link header/);
  });

  it("aborts the request once the request timeout elapses, instead of hanging forever on a stalled response", async () => {
    vi.useFakeTimers();
    // Simulates a real fetch: never settles on its own, but rejects as soon
    // as its AbortSignal fires — this is the exact seam the timeout in
    // sentryClient.ts's createSentryIssueSearcher relies on.
    const fetchStub = vi.fn((_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("This operation was aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    const resultPromise = searchSentryIssues({
      projectSlug: "markpost",
      query: "is:unresolved",
    });
    const assertion =
      expect(resultPromise).rejects.toThrow(/markpost.*timed out/);
    // Matches sentryClient.ts's SENTRY_REQUEST_TIMEOUT_MS.
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });
});
