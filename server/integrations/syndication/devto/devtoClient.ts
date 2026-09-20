import { fetchJson } from "../httpClient";
import type { DevtoArticle, FetchDevtoArticlesPage } from "./types";

const DEVTO_API_BASE_URL = "https://dev.to/api";
// Kept well under Forem's documented per-page ceiling so pagination is
// exercised (and its MAX_PAGES guard is meaningful) rather than relying on
// one very large page — see provider.ts's drainAllPages, which also uses
// this to know when a page is short (the end) vs. merely full.
export const ARTICLES_PAGE_SIZE = 100;
// Forem's versioned API — https://developers.forem.com/api/v1 — is
// requested explicitly via Accept rather than relying on whatever the
// unversioned default resolves to today. UNVERIFIED against a live account
// (this environment has no network access) — the response fields this
// provider reads (id/slug/published_at) are documented as stable across
// v0/v1, so this is a defensive pin, not a hard dependency on v1-only
// fields.
const FOREM_API_V1_ACCEPT_HEADER = "application/vnd.forem.api-v1+json";

/**
 * Builds the real, network-touching `FetchDevtoArticlesPage`. `fetchImpl`
 * defaults to the global `fetch` (via ../httpClient's fetchJson) but is
 * injectable — this is the one function in
 * server/integrations/syndication/devto that would otherwise make a live
 * HTTP call with no seam, unlike mapping.ts/provider.ts, which are tested
 * against a fixture-backed fake with the same signature.
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
  return (page: number): Promise<DevtoArticle[]> =>
    fetchJson<DevtoArticle[]>(
      `${DEVTO_API_BASE_URL}/articles/me/published?page=${page}&per_page=${ARTICLES_PAGE_SIZE}`,
      {
        headers: {
          "api-key": apiKey,
          Accept: FOREM_API_V1_ACCEPT_HEADER,
        },
        fetchImpl,
        vendorLabel: "DEV.to API",
      },
    );
}
