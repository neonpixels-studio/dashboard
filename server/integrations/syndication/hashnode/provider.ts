import type {
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../../types";
import { buildSyndicationResult } from "../normalize";
import { emptySyndicationResult } from "../types";
import { createHashnodePostsPageFetcher } from "./hashnodeClient";
import { toSyndicationSourcePost } from "./mapping";
import type { FetchHashnodePostsPage, HashnodePostNode } from "./types";

const HASHNODE_VENDOR = "hashnode";
// Defends against an infinite loop if Hashnode's pageInfo.hasNextPage ever
// lied (or the fetcher's fixture/fake did, in a test) — 100 pages * 20 posts
// is comfortably beyond any personal blog's post count.
const MAX_PAGES = 100;

/**
 * Per config.ts's row-overrides-shared-default precedent (see
 * server/integrations/stripe/provider.ts's resolveProductIdsSource and
 * server/integrations/ga4/provider.ts's resolvePropertyId), the publication
 * id can live in either `integration_config.external_id` or the shared
 * studio env var `NUXT_HASHNODE_PUBLICATION_ID` — the DB row wins when set.
 */
export function resolvePublicationId(config: IntegrationConfig): string | null {
  const externalId = config.externalId?.trim();
  if (externalId) {
    return externalId;
  }
  const fromEnv = process.env.NUXT_HASHNODE_PUBLICATION_ID?.trim();
  return fromEnv || null;
}

async function drainAllPages(
  fetchPostsPage: FetchHashnodePostsPage,
): Promise<HashnodePostNode[]> {
  const nodes: HashnodePostNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchPostsPage(after);
    nodes.push(...result.nodes);
    if (!result.hasNextPage) {
      return nodes;
    }
    after = result.endCursor;
  }

  throw new Error(
    `Hashnode post pagination did not terminate within ${MAX_PAGES} pages.`,
  );
}

/**
 * Core fetch logic, decoupled from the real Hashnode client so it can be
 * unit tested against a fixture-backed `FetchHashnodePostsPage` with no
 * network call — `hashnodeProvider.fetch` below is the only caller that
 * wires in the real one (hashnodeClient.ts).
 */
export async function fetchHashnodeSyndication(
  fetchPostsPage: FetchHashnodePostsPage,
): Promise<ProviderResult> {
  const nodes = await drainAllPages(fetchPostsPage);
  const posts = nodes.map(toSyndicationSourcePost);
  return buildSyndicationResult(HASHNODE_VENDOR, posts);
}

export const hashnodeProvider: IntegrationProvider = {
  vendor: HASHNODE_VENDOR,
  async fetch(config: IntegrationConfig): Promise<ProviderResult> {
    if (!config.secret) {
      throw new Error(
        `Hashnode provider for "${config.slug}" has no personal access token configured.`,
      );
    }
    const publicationId = resolvePublicationId(config);
    if (!publicationId) {
      // Unconfigured publication id -> no rows, never zeros — same
      // defense-in-depth precedent as fetchStripeMetrics/fetchGa4Metrics's
      // own empty-externalId branch.
      return emptySyndicationResult();
    }

    const fetchPostsPage = createHashnodePostsPageFetcher(
      publicationId,
      config.secret,
    );
    return fetchHashnodeSyndication(fetchPostsPage);
  },
};
