import { parseSentryNextCursor, toSentryIssue } from "./mapping";
import type { SearchSentryIssues, SentryIssuePage } from "./types";

// A hung Sentry request would otherwise block a sync indefinitely (no
// independent deadline on a Netlify function) — same reasoning as
// server/integrations/stripe/stripeClient.ts's STRIPE_REQUEST_TIMEOUT_MS.
const SENTRY_REQUEST_TIMEOUT_MS = 20_000;
// SaaS Sentry only — a self-hosted install would need its own base URL, not
// currently a studio requirement (every property's Sentry org lives on
// sentry.io).
const SENTRY_API_BASE_URL = "https://sentry.io/api/0";

// Only the subset of the global `fetch` signature this package calls —
// narrowing the parameter type (rather than depending on the ambient global
// directly) is what makes `createSentryIssueSearcher` accept a lightweight
// test double instead of a real network call, mirroring
// server/integrations/stripe/stripeClient.ts's StripeSubscriptionsClient and
// server/integrations/ga4/ga4Client.ts's Ga4DataClient seams.
type FetchIssuesPage = typeof fetch;

function buildIssueSearchUrl(
  orgSlug: string,
  projectSlug: string,
  query: string,
  cursor: string | undefined,
): URL {
  const url = new URL(
    `${SENTRY_API_BASE_URL}/projects/${orgSlug}/${projectSlug}/issues/`,
  );
  url.searchParams.set("query", query);
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  return url;
}

async function parseIssuesResponseBody(
  response: Response,
  projectSlug: string,
): Promise<unknown[]> {
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error(
      `Sentry issue search for project "${projectSlug}" returned a non-array response body.`,
    );
  }
  return body;
}

/**
 * Builds the real, network-touching `SearchSentryIssues`. `fetchImpl`
 * defaults to the global `fetch` but is injectable — this is the one
 * function in server/integrations/sentry that would otherwise make a live
 * HTTP call with no seam, unlike every other function in this package
 * (mapping.ts, issueCounts.ts, provider.ts), which already takes a
 * `SearchSentryIssues` as a parameter and is tested against a
 * fixture-backed fake.
 */
export function createSentryIssueSearcher(
  authToken: string,
  orgSlug: string,
  fetchImpl: FetchIssuesPage = fetch,
): SearchSentryIssues {
  return async ({ projectSlug, query, cursor }): Promise<SentryIssuePage> => {
    const url = buildIssueSearchUrl(orgSlug, projectSlug, query, cursor);
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      SENTRY_REQUEST_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: abortController.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        `Sentry issue search for project "${projectSlug}" failed with status ${response.status}.`,
      );
    }

    const rawIssues = await parseIssuesResponseBody(response, projectSlug);
    const nextCursor = parseSentryNextCursor(response.headers.get("link"));

    return {
      issues: rawIssues.map(toSentryIssue),
      hasMore: nextCursor !== null,
      nextCursor,
    };
  };
}
