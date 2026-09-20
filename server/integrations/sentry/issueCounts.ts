import type { SearchSentryIssues } from "./types";

// Defends against a runaway loop if a broken/misbehaving SearchSentryIssues
// (a bad fake in a test, or an unexpected upstream response) keeps claiming
// `hasMore` forever — no real studio project is anywhere near this many
// pages of open issues. Mirrors the fail-loud spirit of
// server/integrations/stripe/mrr.ts's assertPageAdvanced, sized generously
// (100 issues/page * 500 pages = 50,000 issues) rather than tuned tight.
const MAX_ISSUE_SEARCH_PAGES = 500;

/**
 * Walks every page of `searchSentryIssues` for one (project, query) pair and
 * sums the issue count — Sentry's issue-search endpoints have no total-count
 * field (see mapping.ts's parseSentryNextCursor comment), so this is the
 * only way to get one. Used twice per app sync, once for the open-issues
 * query and once for the fatal-issues query (see provider.ts).
 */
export async function countAllSentryIssues(
  searchSentryIssues: SearchSentryIssues,
  projectSlug: string,
  query: string,
): Promise<number> {
  let totalIssues = 0;
  let cursor: string | undefined;
  let hasMore = true;
  let pagesFetched = 0;

  while (hasMore) {
    if (pagesFetched >= MAX_ISSUE_SEARCH_PAGES) {
      throw new Error(
        `Sentry issue search for project "${projectSlug}" (query "${query}") ` +
          `exceeded ${MAX_ISSUE_SEARCH_PAGES} pages — refusing to loop indefinitely.`,
      );
    }

    const page = await searchSentryIssues({ projectSlug, query, cursor });
    totalIssues += page.issues.length;
    pagesFetched += 1;
    hasMore = page.hasMore;
    cursor = page.nextCursor ?? undefined;

    if (hasMore && !cursor) {
      throw new Error(
        `Sentry issue search for project "${projectSlug}" (query "${query}") ` +
          "claimed more results but returned no next cursor.",
      );
    }
  }

  return totalIssues;
}
