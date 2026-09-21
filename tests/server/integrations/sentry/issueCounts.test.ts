import { afterEach, describe, expect, it, vi } from "vitest";
import { countAllSentryIssues } from "../../../../server/integrations/sentry/issueCounts";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type {
  SearchSentryIssues,
  SentryIssuePage,
} from "../../../../server/integrations/sentry/types";

function fakeSearchFromPages(
  pages: Record<string, SentryIssuePage>,
): SearchSentryIssues {
  return vi.fn(async ({ cursor }) => {
    const key = cursor ?? "first";
    const page = pages[key];
    if (!page) {
      throw new Error(`No fixture page registered for cursor "${key}"`);
    }
    return page;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("countAllSentryIssues", () => {
  it("sums a single page's issues when hasMore is false", async () => {
    const page = await loadFixture<SentryIssuePage>(
      "sentry",
      "three-open-issues",
    );
    const searchSentryIssues = fakeSearchFromPages({ first: page });

    const total = await countAllSentryIssues(
      searchSentryIssues,
      "markpost",
      "is:unresolved",
    );

    expect(total).toBe(3);
    expect(searchSentryIssues).toHaveBeenCalledTimes(1);
  });

  it("returns 0 for an empty result set", async () => {
    const page = await loadFixture<SentryIssuePage>("sentry", "no-issues");
    const searchSentryIssues = fakeSearchFromPages({ first: page });

    const total = await countAllSentryIssues(
      searchSentryIssues,
      "markpost",
      "is:unresolved level:fatal",
    );

    expect(total).toBe(0);
  });

  it("walks every page via the cursor and sums the totals", async () => {
    const pageOne = await loadFixture<SentryIssuePage>(
      "sentry",
      "paginated-page-1",
    );
    const pageTwo = await loadFixture<SentryIssuePage>(
      "sentry",
      "paginated-page-2",
    );
    const searchSentryIssues = fakeSearchFromPages({
      first: pageOne,
      "0:100:0": pageTwo,
    });

    const total = await countAllSentryIssues(
      searchSentryIssues,
      "markpost",
      "is:unresolved",
    );

    expect(total).toBe(3);
    expect(searchSentryIssues).toHaveBeenCalledTimes(2);
    expect(searchSentryIssues).toHaveBeenNthCalledWith(1, {
      projectSlug: "markpost",
      query: "is:unresolved",
      cursor: undefined,
    });
    expect(searchSentryIssues).toHaveBeenNthCalledWith(2, {
      projectSlug: "markpost",
      query: "is:unresolved",
      cursor: "0:100:0",
    });
  });

  it("fails loud instead of looping forever when a page claims hasMore but returns no next cursor", async () => {
    const malformedPage: SentryIssuePage = {
      issues: [{ id: "issue_1" }],
      hasMore: true,
      nextCursor: null,
    };
    const searchSentryIssues = fakeSearchFromPages({ first: malformedPage });

    await expect(
      countAllSentryIssues(searchSentryIssues, "markpost", "is:unresolved"),
    ).rejects.toThrow(/claimed more results but returned no next cursor/);
  });

  it("fails loud instead of looping forever against a misbehaving searcher that never stops paginating", async () => {
    const searchSentryIssues = vi.fn(async () => ({
      issues: [{ id: "issue_stuck" }],
      hasMore: true,
      nextCursor: "same-cursor",
    }));

    await expect(
      countAllSentryIssues(searchSentryIssues, "markpost", "is:unresolved"),
    ).rejects.toThrow(/exceeded \d+ pages/);
  });

  it("fails loud instead of running past its wall-clock budget, even when each individual page resolves quickly", async () => {
    vi.useFakeTimers();
    // Each page "takes" 1s of wall-clock time (simulating slow-but-not-hung
    // requests) — the duration guard must trip well before the 20-page cap
    // would (8 pages * 1s = 8s, the guard's threshold; 20 pages * 1s = 20s).
    const searchSentryIssues = vi.fn(async () => {
      vi.advanceTimersByTime(1_000);
      return {
        issues: [{ id: "issue_slow" }],
        hasMore: true,
        nextCursor: "next",
      };
    });

    await expect(
      countAllSentryIssues(searchSentryIssues, "markpost", "is:unresolved"),
    ).rejects.toThrow(/exceeded 8000ms/);
    expect(searchSentryIssues.mock.calls.length).toBeLessThan(20);
  });
});
