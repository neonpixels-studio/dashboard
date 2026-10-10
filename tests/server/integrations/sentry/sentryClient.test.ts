import { afterEach, describe, expect, it, vi } from "vitest";
import { createSentryIssueSearcher } from "../../../../server/integrations/sentry/sentryClient";
import { createHangingFetch } from "../../../../server/integrations/testing/hangingFetch";

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
  extraHeaders?: Record<string, string>;
}) {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
    headers: {
      get: (name: string) => {
        const extraValue = response.extraHeaders?.[name.toLowerCase()];
        if (extraValue !== undefined) {
          return extraValue;
        }
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
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      createHangingFetch(),
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

  it("aborts on a shared deadline (issue #62), distinctly from its own request timeout, once the run's budget is exhausted", async () => {
    // Here the shared deadline's signal — not sentryClient.ts's own
    // SENTRY_REQUEST_TIMEOUT_MS — is what fires.
    const deadlineController = new AbortController();
    const searchSentryIssues = createSentryIssueSearcher(
      "token_abc",
      "acme",
      createHangingFetch(),
      { signal: deadlineController.signal, remainingMs: () => 0 },
    );

    const resultPromise = searchSentryIssues({
      projectSlug: "markpost",
      query: "is:unresolved",
    });
    const assertion = expect(resultPromise).rejects.toThrow(
      /markpost.*shared run budget was exhausted/,
    );
    deadlineController.abort();
    await assertion;
  });

  describe("429 rate-limit retries (issue #107)", () => {
    function buildSequencedFetch(
      responses: Parameters<typeof buildFetchStub>[0][],
    ) {
      const stubs = responses.map((response) => buildFetchStub(response));
      let callIndex = 0;
      return vi.fn(async (...args: Parameters<typeof fetch>) => {
        const stub = stubs[Math.min(callIndex, stubs.length - 1)];
        callIndex++;
        return stub!(...args);
      }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    }

    const rateLimited = (extraHeaders: Record<string, string> = {}) => ({
      ok: false,
      status: 429,
      body: {},
      extraHeaders,
    });
    const success = { ok: true, status: 200, body: [] };
    const search = (searcher: ReturnType<typeof createSentryIssueSearcher>) =>
      searcher({ projectSlug: "markpost", query: "is:unresolved" });

    it("resolves when a 429 is followed by a 200", async () => {
      vi.useFakeTimers();
      const fetchStub = buildSequencedFetch([rateLimited(), success]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(resultPromise).resolves.toMatchObject({ issues: [] });
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("waits for Retry-After seconds before retrying", async () => {
      vi.useFakeTimers();
      const fetchStub = buildSequencedFetch([
        rateLimited({ "retry-after": "1" }),
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("falls back to x-sentry-rate-limit-reset (epoch seconds) when Retry-After is absent", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
      const resetEpochSeconds = Date.now() / 1000 + 1;
      const fetchStub = buildSequencedFetch([
        rateLimited({
          "x-sentry-rate-limit-reset": String(resetEpochSeconds),
        }),
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("clamps an oversized Retry-After to the 2s ceiling", async () => {
      vi.useFakeTimers();
      const fetchStub = buildSequencedFetch([
        rateLimited({ "retry-after": "60" }),
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(2_000);
      await resultPromise;
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("stops after 3 retries and throws the existing status-429 error", async () => {
      vi.useFakeTimers();
      const fetchStub = buildSequencedFetch([rateLimited()]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );
      const assertion = expect(resultPromise).rejects.toThrow(
        'Sentry issue search for project "markpost" failed with status 429.',
      );

      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(fetchStub).toHaveBeenCalledTimes(4);
    });

    it("cancels a pending retry wait when the shared deadline aborts", async () => {
      vi.useFakeTimers();
      const deadlineController = new AbortController();
      const fetchStub = buildSequencedFetch([rateLimited(), success]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub, {
          signal: deadlineController.signal,
          remainingMs: () => 0,
        }),
      );
      const assertion = expect(resultPromise).rejects.toThrow(
        /markpost.*shared run budget was exhausted/,
      );

      await vi.advanceTimersByTimeAsync(100);
      deadlineController.abort();
      await assertion;
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });

    it("does not retry non-429 failures", async () => {
      const fetchStub = buildSequencedFetch([
        { ok: false, status: 500, body: {} },
      ]);

      await expect(
        search(createSentryIssueSearcher("token_abc", "acme", fetchStub)),
      ).rejects.toThrow(/failed with status 500/);
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });
  });
});
