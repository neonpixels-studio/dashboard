import type {
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../../types";
import { resolveExternalIdOrEnvVar } from "../configResolution";
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
 * The publication id can live in either `integration_config.external_id` or
 * the shared studio env var `NUXT_HASHNODE_PUBLICATION_ID` — the DB row wins
 * when set. See ../configResolution.ts for the shared row-overrides-default
 * precedent this follows (same as Stripe's product ids / GA4's property
 * ids).
 */
export function resolvePublicationId(config: IntegrationConfig): string | null {
  return resolveExternalIdOrEnvVar(config, "NUXT_HASHNODE_PUBLICATION_ID");
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
    if (!result.endCursor) {
      // hasNextPage=true with no endCursor would otherwise re-request `after:
      // null` — the FIRST page — forever, duplicating its nodes on every
      // loop until MAX_PAGES throws, rather than failing loud on the actual
      // problem (a self-contradictory response).
      throw new Error(
        "Hashnode reported hasNextPage=true with no endCursor — refusing to re-request the first page.",
      );
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
