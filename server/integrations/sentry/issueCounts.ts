import type { SearchSentryIssues } from "./types";

// Defends against a runaway loop if a broken/misbehaving SearchSentryIssues
// (a bad fake in a test, or an unexpected upstream response) keeps claiming
// `hasMore` forever, mirroring the fail-loud spirit of
// server/integrations/stripe/mrr.ts's assertPageAdvanced. Deliberately NOT
// sized "generously" the way that guard is: netlify/functions/scheduled-sync.ts's
// FETCH_TIMEOUT_MS caps the studio's ENTIRE /api/sync call (every provider,
// concurrently) at 9s, well under Netlify's own 10s synchronous function
// limit — a chain of sequential paginated requests here is the one shape in
// this provider that could burn through that whole budget on its own. 20
// pages (Sentry's default page size, ~25-100 issues/page, so 500-2,000
// issues) is comfortably past any realistic open-issue count for basin/
// markpost/wanderist; a project that legitimately exceeds it needs this
// provider's fan-out reworked (see scheduled-sync.ts's own comment on
// FETCH_TIMEOUT_MS — this is the same tight-budget tension, not a new one),
// not a bigger number here.
const MAX_ISSUE_SEARCH_PAGES = 20;

// Bounds the WHOLE pagination walk's wall-clock time, not just each
// individual request (sentryClient.ts's SENTRY_REQUEST_TIMEOUT_MS is
// deliberately per-request, at 20s — longer than this). MAX_ISSUE_SEARCH_PAGES
// alone doesn't bound elapsed time if pages are merely slow rather than
// fully hung; this does. Kept comfortably under scheduled-sync.ts's 9s
// /api/sync ceiling so a slow Sentry query fails loud on its own, specific
// terms instead of just being one anonymous contributor to the whole sync
// getting killed with no indication of which provider was slow.
const MAX_ISSUE_SEARCH_DURATION_MS = 8_000;

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
  const startedAt = Date.now();
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
    if (Date.now() - startedAt >= MAX_ISSUE_SEARCH_DURATION_MS) {
      throw new Error(
        `Sentry issue search for project "${projectSlug}" (query "${query}") ` +
          `exceeded ${MAX_ISSUE_SEARCH_DURATION_MS}ms across ${pagesFetched} page(s) — ` +
          "refusing to keep paginating past the sync's time budget.",
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
