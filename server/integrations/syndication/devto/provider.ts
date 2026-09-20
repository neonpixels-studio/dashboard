import type {
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../../types";
import { buildSyndicationResult } from "../normalize";
import { createDevtoArticlesPageFetcher } from "./devtoClient";
import { toSyndicationSourcePost } from "./mapping";
import type { DevtoArticle, FetchDevtoArticlesPage } from "./types";

const DEVTO_VENDOR = "devto";
// Defends against an infinite loop if a fetcher (real or, in a test, faked)
// never returns a short/empty page — 100 pages is comfortably beyond any
// personal blog's post count, whatever the actual per-page size.
const MAX_PAGES = 100;
const FIRST_PAGE = 1;

async function drainAllPages(
  fetchArticlesPage: FetchDevtoArticlesPage,
): Promise<DevtoArticle[]> {
  const articles: DevtoArticle[] = [];

  for (let page = FIRST_PAGE; page <= MAX_PAGES; page += 1) {
    const pageArticles = await fetchArticlesPage(page);
    articles.push(...pageArticles);
    if (!pageArticles.length) {
      return articles;
    }
  }

  throw new Error(
    `DEV.to article pagination did not terminate within ${MAX_PAGES} pages.`,
  );
}

/**
 * Core fetch logic, decoupled from the real DEV.to client so it can be unit
 * tested against a fixture-backed `FetchDevtoArticlesPage` with no network
 * call — `devtoProvider.fetch` below is the only caller that wires in the
 * real one (devtoClient.ts).
 */
export async function fetchDevtoSyndication(
  fetchArticlesPage: FetchDevtoArticlesPage,
): Promise<ProviderResult> {
  const articles = await drainAllPages(fetchArticlesPage);
  const posts = articles.map(toSyndicationSourcePost);
  return buildSyndicationResult(DEVTO_VENDOR, posts);
}

export const devtoProvider: IntegrationProvider = {
  vendor: DEVTO_VENDOR,
  async fetch(config: IntegrationConfig): Promise<ProviderResult> {
    if (!config.secret) {
      throw new Error(
        `DEV.to provider for "${config.slug}" has no API key configured.`,
      );
    }
    // No separate publication/property id: DEV.to's API key alone
    // identifies the account, and /articles/me/published scopes to it — see
    // devtoClient.ts. Unlike Hashnode/GA4/Stripe, there is no
    // unconfigured-external-id branch here for that reason.
    const fetchArticlesPage = createDevtoArticlesPageFetcher(config.secret);
    return fetchDevtoSyndication(fetchArticlesPage);
  },
};
