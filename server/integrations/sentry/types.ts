// Plain, JSON-serializable subset of a Sentry issue (group) this provider
// needs. Deliberately NOT the full Sentry API issue shape (dozens of fields:
// culprit, metadata, assignee, ...) — mapping.ts is the one place that
// translates a raw API response into this narrower shape; issueCounts.ts and
// provider.ts (and their tests) only ever see this file's types, and test
// fixtures are recorded directly in this shape. Mirrors
// server/integrations/stripe/types.ts's StripeSubscription split.
//
// Only `id` is kept today: this provider counts issues per (status, level)
// query rather than reading each issue's own fields (see provider.ts's two
// separate queries, "is:unresolved" and "is:unresolved level:fatal") — `id`
// still round-trips so a malformed row (missing id) fails loud in mapping.ts
// instead of silently counting toward the total.
export interface SentryIssue {
  id: string;
}

export interface SentryIssuePage {
  issues: SentryIssue[];
  hasMore: boolean;
  // Present whenever hasMore is true — the cursor issueCounts.ts passes back
  // in to fetch the next page. Null once Sentry's Link header reports
  // results="false" for "next".
  nextCursor: string | null;
}

export interface SentryIssueSearchRequest {
  projectSlug: string;
  // Sentry's search query syntax, e.g. "is:unresolved" or
  // "is:unresolved level:fatal" — see provider.ts's two query constants.
  query: string;
  cursor?: string;
}

// The seam every pure function in this package is tested against instead of
// a real HTTP call: `createSentryIssueSearcher` (sentryClient.ts) builds the
// real implementation; provider/issueCounts unit tests substitute a
// fixture-backed fake with the same signature and never touch the network.
export type SearchSentryIssues = (
  request: SentryIssueSearchRequest,
) => Promise<SentryIssuePage>;
