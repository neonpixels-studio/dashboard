import { NO_DEADLINE, type FetchDeadline } from "../types";
import { parseSentryNextCursor, toSentryIssue } from "./mapping";
import { SENTRY_STATS_PERIOD, toSentryIssueSummary } from "./issueSummary";
import type {
  FetchSentryTopIssues,
  SearchSentryIssues,
  SentryIssuePage,
  SentryTopIssuesPage,
} from "./types";

// A hung Sentry request would otherwise block a sync indefinitely (no
// independent deadline on a Netlify function) — same reasoning as
// server/integrations/stripe/stripeClient.ts's STRIPE_REQUEST_TIMEOUT_MS.
// One timer covers a whole search, including any 429 retries and their waits.
const SENTRY_REQUEST_TIMEOUT_MS = 20_000;
// SaaS Sentry only — a self-hosted install would need its own base URL, not
// currently a studio requirement (every property's Sentry org lives on
// sentry.io).
const SENTRY_API_BASE_URL = "https://sentry.io/api/0";

// Sentry's issue-search endpoint allows 5 requests per 1-second window per
// token, and one sync batch can burst past that (issue #107). A 429 is
// transient, so it is retried a bounded number of times instead of failing
// the whole project's sync.
const HTTP_TOO_MANY_REQUESTS = 429;
const SENTRY_MAX_RATE_LIMIT_RETRIES = 3;
// The rate-limit window is 1s, so this is a sensible wait when Sentry sends
// no usable hint header.
const SENTRY_DEFAULT_RETRY_DELAY_MS = 1_000;
// Clamp so a large or bogus header can never stall a sync.
const SENTRY_MAX_RETRY_DELAY_MS = 2_000;
const SENTRY_MIN_RETRY_DELAY_MS = 250;
const MS_PER_SECOND = 1_000;

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
  params: Record<string, string | undefined>,
): URL {
  // Both slugs are encoded before joining into the path — orgSlug is a
  // shared env var, but projectSlug comes from integration_config.external_id
  // (a DB-writable, row-supplied value), so an unencoded "/" or "?" in it
  // could otherwise redirect the request to a different path/query entirely.
  const url = new URL(
    `${SENTRY_API_BASE_URL}/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectSlug)}/issues/`,
  );
  for (const [name, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(name, value);
    }
  }
  return url;
}

// Relabels an abort with project context. Checks `deadline` before
// `abortController` (see fetchIssuesPage). Returns null when neither fired.
function buildAbortedSearchError(
  abortController: AbortController,
  deadline: FetchDeadline,
  projectSlug: string,
  cause: unknown,
): Error | null {
  if (deadline.signal.aborted) {
    return new Error(
      `Sentry issue search for project "${projectSlug}" was aborted because the sync's shared run budget was exhausted.`,
      { cause },
    );
  }
  if (abortController.signal.aborted) {
    return new Error(
      `Sentry issue search for project "${projectSlug}" timed out after ${SENTRY_REQUEST_TIMEOUT_MS}ms.`,
      { cause },
    );
  }
  return null;
}

async function fetchIssuesPage(
  fetchImpl: FetchIssuesPage,
  url: URL,
  authToken: string,
  abortController: AbortController,
  deadline: FetchDeadline,
  projectSlug: string,
): Promise<Response> {
  // Aborts on whichever fires first: this request's own
  // SENTRY_REQUEST_TIMEOUT_MS (abortController) or the shared run budget
  // (deadline) — see ../types.ts's FetchDeadline comment for why a hung
  // request must respect both.
  const requestSignal = AbortSignal.any([
    abortController.signal,
    deadline.signal,
  ]);

  try {
    return await fetchImpl(url, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: requestSignal,
    });
  } catch (cause) {
    // Distinguishes which of the two signals above fired from any other
    // rejection (a DNS/network failure unrelated to either) — only an
    // actual abort gets relabeled. Without this, a raw AbortError ("This
    // operation was aborted") lands in sync_status.error with no project/
    // query/cause context, the same gap parseIssuesResponseBody closes for
    // a non-JSON body below. Checks `deadline` before `abortController` —
    // matching syndication/httpClient.ts's identical sendRequest check — so
    // the rare case where BOTH have already fired by the time this runs
    // reports the same message regardless of which vendor's client it is.
    const abortedError = buildAbortedSearchError(
      abortController,
      deadline,
      projectSlug,
      cause,
    );
    if (abortedError) {
      throw abortedError;
    }
    throw cause;
  }
}

function parseRetryAfterMs(headers: Headers): number | null {
  const rawRetryAfter = headers.get("retry-after");
  if (!rawRetryAfter) {
    return null;
  }
  const seconds = Number(rawRetryAfter);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds * MS_PER_SECOND;
}

function parseRateLimitResetMs(headers: Headers, nowMs: number): number | null {
  const rawReset = headers.get("x-sentry-rate-limit-reset");
  if (!rawReset) {
    return null;
  }
  const resetEpochSeconds = Number(rawReset);
  if (!Number.isFinite(resetEpochSeconds)) {
    return null;
  }
  return resetEpochSeconds * MS_PER_SECOND - nowMs;
}

// Prefers Retry-After, then x-sentry-rate-limit-reset (epoch seconds), then a
// default; always clamped to [MIN, MAX] so a zero/past hint (clock skew) can't
// burn every retry instantly and a huge one can't stall the sync.
function resolveRetryDelayMs(headers: Headers, nowMs: number): number {
  const hintedDelayMs =
    parseRetryAfterMs(headers) ??
    parseRateLimitResetMs(headers, nowMs) ??
    SENTRY_DEFAULT_RETRY_DELAY_MS;
  return Math.max(
    SENTRY_MIN_RETRY_DELAY_MS,
    Math.min(hintedDelayMs, SENTRY_MAX_RETRY_DELAY_MS),
  );
}

// Resolves after `delayMs`, or rejects as soon as either the request timeout
// or the shared run budget fires, so a retry wait never outlives either.
function waitForRetry(
  delayMs: number,
  abortController: AbortController,
  deadline: FetchDeadline,
  projectSlug: string,
): Promise<void> {
  const waitSignal = AbortSignal.any([abortController.signal, deadline.signal]);
  const buildAbortError = () =>
    buildAbortedSearchError(
      abortController,
      deadline,
      projectSlug,
      waitSignal.reason,
    ) ?? waitSignal.reason;

  return new Promise((resolve, reject) => {
    if (waitSignal.aborted) {
      reject(buildAbortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timerId);
      reject(buildAbortError());
    };
    const timerId = setTimeout(() => {
      waitSignal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    waitSignal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchIssuesPageWithRetry(
  fetchImpl: FetchIssuesPage,
  url: URL,
  authToken: string,
  abortController: AbortController,
  deadline: FetchDeadline,
  projectSlug: string,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetchIssuesPage(
      fetchImpl,
      url,
      authToken,
      abortController,
      deadline,
      projectSlug,
    );
    if (
      response.status !== HTTP_TOO_MANY_REQUESTS ||
      attempt >= SENTRY_MAX_RATE_LIMIT_RETRIES
    ) {
      return response;
    }
    // An unread body keeps its socket checked out under undici's fetch.
    await response.body?.cancel().catch(() => undefined);
    await waitForRetry(
      resolveRetryDelayMs(response.headers, Date.now()),
      abortController,
      deadline,
      projectSlug,
    );
  }
}

async function parseIssuesResponseBody(
  response: Response,
  projectSlug: string,
): Promise<unknown[]> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    // A 200 response can still carry a non-JSON body (e.g. an HTML error
    // page from Sentry's edge during an incident) — response.json() throws
    // a bare SyntaxError with no mention of which project/request it came
    // from; wrap it so the failure is identifiable in sync_status.error.
    throw new Error(
      `Sentry issue search for project "${projectSlug}" returned a non-JSON response body.`,
      { cause },
    );
  }
  if (!Array.isArray(body)) {
    throw new Error(
      `Sentry issue search for project "${projectSlug}" returned a non-array response body.`,
    );
  }
  return body;
}

interface IssuesResponse {
  rawIssues: unknown[];
  headers: Headers;
}

// One timed, rate-limit-retried request for a project's issue list. Both
// public factories below go through here, so every Sentry call shares the
// same timeout, shared-deadline and 429 handling (issue #107).
async function requestIssues(
  fetchImpl: FetchIssuesPage,
  url: URL,
  authToken: string,
  deadline: FetchDeadline,
  projectSlug: string,
): Promise<IssuesResponse> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    SENTRY_REQUEST_TIMEOUT_MS,
  );

  // The deadline must cover reading the response body, not just receiving
  // headers — `response.json()` still streams over the same connection, so
  // clearing the timeout right after `fetchImpl` resolves would leave a
  // stalled body read with no deadline at all. Both the request and the
  // body parse stay inside this one try, and the timer only clears once
  // both are done.
  try {
    const response = await fetchIssuesPageWithRetry(
      fetchImpl,
      url,
      authToken,
      abortController,
      deadline,
      projectSlug,
    );

    if (!response.ok) {
      throw new Error(
        `Sentry issue search for project "${projectSlug}" failed with status ${response.status}.`,
      );
    }

    const rawIssues = await parseIssuesResponseBody(response, projectSlug);
    return { rawIssues, headers: response.headers };
  } finally {
    clearTimeout(timeoutId);
  }
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
  // Defaults to NO_DEADLINE so exercising this function directly (every
  // existing unit test) needs no deadline at all — only sentryProvider.fetch
  // (wired from runSync's shared FetchDeadline) passes a real one.
  deadline: FetchDeadline = NO_DEADLINE,
): SearchSentryIssues {
  return async ({ projectSlug, query, cursor }): Promise<SentryIssuePage> => {
    const url = buildIssueSearchUrl(orgSlug, projectSlug, { query, cursor });
    const { rawIssues, headers } = await requestIssues(
      fetchImpl,
      url,
      authToken,
      deadline,
      projectSlug,
    );
    const nextCursor = parseSentryNextCursor(headers.get("link"));

    return {
      issues: rawIssues.map(toSentryIssue),
      hasMore: nextCursor !== null,
      nextCursor,
    };
  };
}

// The panel shows the top few issues, but the trend is summed over the whole
// page, so a larger page than the list needs gives it a fuller picture while
// still costing one request.
const TOP_ISSUES_PAGE_SIZE = "25";
const TOP_ISSUES_SORT = "freq";

/**
 * Builds the single-request fetcher behind the Sentry panel: the project's
 * most frequent unresolved issues with their 14-day event stats. One request
 * (with the shared 429 retry), no pagination walk.
 */
export function createSentryTopIssuesFetcher(
  authToken: string,
  orgSlug: string,
  fetchImpl: FetchIssuesPage = fetch,
  deadline: FetchDeadline = NO_DEADLINE,
): FetchSentryTopIssues {
  return async ({ projectSlug, query }): Promise<SentryTopIssuesPage> => {
    const url = buildIssueSearchUrl(orgSlug, projectSlug, {
      query,
      sort: TOP_ISSUES_SORT,
      limit: TOP_ISSUES_PAGE_SIZE,
      statsPeriod: SENTRY_STATS_PERIOD,
    });
    const { rawIssues } = await requestIssues(
      fetchImpl,
      url,
      authToken,
      deadline,
      projectSlug,
    );
    return { issues: rawIssues.map(toSentryIssueSummary) };
  };
}
