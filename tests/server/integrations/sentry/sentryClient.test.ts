import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSentryIssueSearcher,
  createSentryTopIssuesFetcher,
} from "../../../../server/integrations/sentry/sentryClient";
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
  bodyCancel?: () => Promise<void>;
}) {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
    body: response.bodyCancel ? { cancel: response.bodyCancel } : undefined,
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
          remainingMs: () => 60_000,
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

    it("floors a zero Retry-After so retries are never instantaneous", async () => {
      vi.useFakeTimers();
      const fetchStub = buildSequencedFetch([
        rateLimited({ "retry-after": "0" }),
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(249);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("floors a reset timestamp already in the past", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
      const fetchStub = buildSequencedFetch([
        rateLimited({
          "x-sentry-rate-limit-reset": String(Date.now() / 1000 - 30),
        }),
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(249);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("ignores an unparseable Retry-After (HTTP date) and uses the reset header", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
      const fetchStub = buildSequencedFetch([
        rateLimited({
          "retry-after": "Sat, 10 Oct 2026 12:00:01 GMT",
          "x-sentry-rate-limit-reset": String(Date.now() / 1000 + 1.5),
        }),
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(1_499);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;
      expect(fetchStub).toHaveBeenCalledTimes(2);
    });

    it("rejects with the timeout message when the request timer fires during a retry wait", async () => {
      vi.useFakeTimers();
      const slowRateLimitedFetch = buildSequencedFetch([
        rateLimited({ "retry-after": "2" }),
        success,
      ]);
      const slowFetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
        await new Promise((resolve) => setTimeout(resolve, 19_000));
        return slowRateLimitedFetch(...args);
      }) as unknown as typeof fetch;
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", slowFetch),
      );
      const assertion = expect(resultPromise).rejects.toThrow(
        /markpost.*timed out after 20000ms/,
      );

      await vi.advanceTimersByTimeAsync(21_000);
      await assertion;
      expect(slowFetch).toHaveBeenCalledTimes(1);
    });

    it("cancels the unread 429 body before waiting to retry", async () => {
      vi.useFakeTimers();
      const bodyCancel = vi.fn(async () => {});
      const fetchStub = buildSequencedFetch([
        { ...rateLimited(), bodyCancel },
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(1_000);
      await resultPromise;
      expect(bodyCancel).toHaveBeenCalledTimes(1);
    });

    it("falls back to the 1s default for a negative Retry-After and a non-numeric reset header", async () => {
      vi.useFakeTimers();
      const fetchStub = buildSequencedFetch([
        rateLimited({
          "retry-after": "-5",
          "x-sentry-rate-limit-reset": "soon",
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

    it("prefers a valid Retry-After over a valid reset header", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
      const fetchStub = buildSequencedFetch([
        rateLimited({
          "retry-after": "0.5",
          "x-sentry-rate-limit-reset": String(Date.now() / 1000 + 1.5),
        }),
        success,
      ]);
      const resultPromise = search(
        createSentryIssueSearcher("token_abc", "acme", fetchStub),
      );

      await vi.advanceTimersByTimeAsync(499);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await resultPromise;
      expect(fetchStub).toHaveBeenCalledTimes(2);
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

describe("createSentryTopIssuesFetcher", () => {
  const RAW_ISSUE = {
    id: "10",
    title: "TypeError: feed.items is undefined",
    level: "error",
    culprit: "parsers/rss.ts",
    count: "41",
    userCount: 14,
    lastSeen: "2026-09-19T00:00:00.000Z",
    permalink: "https://sentry.io/organizations/acme/issues/10/",
    project: { id: "7" },
    stats: { "14d": [[1_758_240_000, 3]] },
  };

  it("asks for one page of the most frequent issues with 14-day stats", async () => {
    const fetchStub = buildFetchStub({ ok: true, status: 200, body: [] });
    const fetchTopIssues = createSentryTopIssuesFetcher(
      "token_abc",
      "acme",
      fetchStub,
    );

    await fetchTopIssues({ projectSlug: "markpost", query: "is:unresolved" });

    const [requestedUrl, init] = (
      fetchStub as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [URL, RequestInit];
    expect(requestedUrl.pathname).toBe("/api/0/projects/acme/markpost/issues/");
    expect(Object.fromEntries(requestedUrl.searchParams)).toEqual({
      query: "is:unresolved",
      sort: "freq",
      limit: "25",
      statsPeriod: "14d",
    });
    expect(init.headers).toEqual({ Authorization: "Bearer token_abc" });
  });

  it("maps the response into issue summaries and does not need a Link header", async () => {
    const fetchStub = buildFetchStub({
      ok: true,
      status: 200,
      body: [RAW_ISSUE],
      linkHeader: null,
    });

    const page = await createSentryTopIssuesFetcher(
      "token_abc",
      "acme",
      fetchStub,
    )({ projectSlug: "markpost", query: "is:unresolved" });

    expect(page.issues).toEqual([
      expect.objectContaining({
        id: "10",
        eventCount: 41,
        permalink: "https://sentry.io/organizations/acme/issues/10/",
        projectId: "7",
      }),
    ]);
  });

  it("retries a 429 through the shared retry handling instead of failing", async () => {
    vi.useFakeTimers();
    const rateLimited = buildFetchStub({
      ok: false,
      status: 429,
      body: {},
    });
    const success = buildFetchStub({ ok: true, status: 200, body: [] });
    const fetchStub = vi
      .fn()
      .mockImplementationOnce(rateLimited)
      .mockImplementationOnce(success) as unknown as typeof fetch;

    const resultPromise = createSentryTopIssuesFetcher(
      "token_abc",
      "acme",
      fetchStub,
    )({ projectSlug: "markpost", query: "is:unresolved" });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resultPromise).resolves.toEqual({ issues: [] });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("throws on a non-ok status", async () => {
    const fetchStub = buildFetchStub({ ok: false, status: 500, body: {} });

    await expect(
      createSentryTopIssuesFetcher(
        "token_abc",
        "acme",
        fetchStub,
      )({
        projectSlug: "markpost",
        query: "is:unresolved",
      }),
    ).rejects.toThrow("failed with status 500");
  });

  it("throws when an issue is malformed", async () => {
    const fetchStub = buildFetchStub({
      ok: true,
      status: 200,
      body: [{ ...RAW_ISSUE, permalink: "javascript:alert(1)" }],
    });

    await expect(
      createSentryTopIssuesFetcher(
        "token_abc",
        "acme",
        fetchStub,
      )({
        projectSlug: "markpost",
        query: "is:unresolved",
      }),
    ).rejects.toThrow("not an https URL");
  });
});
