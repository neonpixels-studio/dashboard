import { NO_DEADLINE } from "../../types";
import type {
  FetchDeadline,
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../../types";
import { buildSyndicationResult } from "../normalize";
import { POSTS_PAGE_SIZE, createZyvopPostsPageFetcher } from "./zyvopClient";
import { toSyndicationSourcePost } from "./mapping";
import type { FetchZyvopPostsPage, ZyvopPost } from "./types";

const ZYVOP_VENDOR = "zyvop";
// Guards against an infinite loop if a fetcher never returns a short page,
// same as ../devto/provider.ts.
const MAX_PAGES = 100;

async function drainAllPages(
  fetchPostsPage: FetchZyvopPostsPage,
): Promise<ZyvopPost[]> {
  const posts: ZyvopPost[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const pagePosts = await fetchPostsPage(page * POSTS_PAGE_SIZE);
    posts.push(...pagePosts);
    if (pagePosts.length < POSTS_PAGE_SIZE) {
      return posts;
    }
  }

  throw new Error(
    `ZyVOP post pagination did not terminate within ${MAX_PAGES} pages.`,
  );
}

/**
 * Core fetch logic, decoupled from the real ZyVOP client so it can be unit
 * tested against a fake `FetchZyvopPostsPage`.
 */
export async function fetchZyvopSyndication(
  fetchPostsPage: FetchZyvopPostsPage,
): Promise<ProviderResult> {
  const posts = await drainAllPages(fetchPostsPage);
  return buildSyndicationResult(
    ZYVOP_VENDOR,
    posts.map(toSyndicationSourcePost),
  );
}

export const zyvopProvider: IntegrationProvider = {
  vendor: ZYVOP_VENDOR,
  async fetch(
    config: IntegrationConfig,
    deadline: FetchDeadline = NO_DEADLINE,
  ): Promise<ProviderResult> {
    if (!config.secret) {
      throw new Error(
        `ZyVOP provider for "${config.slug}" has no developer token configured.`,
      );
    }
    // The developer token alone identifies the author, like DEV.to's API key.
    const fetchPostsPage = createZyvopPostsPageFetcher(
      config.secret,
      undefined,
      deadline,
    );
    return fetchZyvopSyndication(fetchPostsPage);
  },
};
