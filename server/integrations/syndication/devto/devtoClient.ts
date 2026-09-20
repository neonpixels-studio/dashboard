import type { DevtoArticle, FetchDevtoArticlesPage } from "./types";

// A hung request would otherwise block a sync indefinitely (no independent
// deadline on a Netlify function) — same reasoning as
// server/integrations/stripe/stripeClient.ts's STRIPE_REQUEST_TIMEOUT_MS.
const DEVTO_REQUEST_TIMEOUT_MS = 20_000;
const DEVTO_API_BASE_URL = "https://dev.to/api";
// Kept well under Forem's documented per-page ceiling so pagination is
// exercised (and its MAX_PAGES guard is meaningful) rather than relying on
// one very large page — see provider.ts's drainAllPages.
const ARTICLES_PAGE_SIZE = 100;

/**
 * Builds the real, network-touching `FetchDevtoArticlesPage`. `fetchImpl`
 * defaults to the global `fetch` but is injectable — this is the one
 * function in server/integrations/syndication/devto that would otherwise
 * make a live HTTP call with no seam, unlike mapping.ts/provider.ts, which
 * are tested against a fixture-backed fake with the same signature.
 *
 * Reads /articles/me/published (not the plain /articles/me, which also
 * includes drafts) — a draft has no meaningful publishedAt/postRef pairing
 * yet and isn't "synced" to the platform, so it must never surface as a
 * syndication_post row nor count toward the `posts` metric.
 */
export function createDevtoArticlesPageFetcher(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): FetchDevtoArticlesPage {
  return async (page: number): Promise<DevtoArticle[]> => {
    const url = `${DEVTO_API_BASE_URL}/articles/me/published?page=${page}&per_page=${ARTICLES_PAGE_SIZE}`;
    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      DEVTO_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetchImpl(url, {
        headers: { "api-key": apiKey },
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new Error(
          `DEV.to API responded with ${response.status} ${response.statusText}.`,
        );
      }
      return (await response.json()) as DevtoArticle[];
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
