import { useDb } from "../../../db";
import { METRIC_POSTS } from "../../../utils/dashboardMetrics";
import { fetchLatestMetricCapturedAt } from "../../../utils/dashboardQueries";
import type {
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../../types";
import { resolveExternalIdOrEnvVar } from "../configResolution";
import { buildSyndicationResult } from "../normalize";
import { emptySyndicationResult, type SyndicationSourcePost } from "../types";
import {
  createMediumArticleIdLister,
  createMediumArticleInfoFetcher,
} from "./mediumClient";
import { isMediumSyncDue } from "./mediumSyncGuard";
import { toSyndicationSourcePost } from "./mapping";
import type { FetchMediumArticleInfo, ListMediumArticleIds } from "./types";

const MEDIUM_VENDOR = "medium";
// Bounds the per-sync request cost of fetching full article detail (title/
// slug/publishedAt), on top of the 2 flat requests createMediumArticleIdLister
// always makes — see mediumClient.ts and mediumSyncGuard.ts's rate-limit
// comment. The `posts` metric itself still reports the platform's true total
// (articleIds.length, free — already in hand from the id listing) so it's
// never stale/undercounted; only the syndication_post rows (and therefore
// the matrix) are bounded to the MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC most
// recently listed each sync. Flagged as a follow-up: a cheaper, incremental
// way to backfill the rest (e.g. only fetching ids not already present in
// syndication_post) needs its own DB read, which this pure fetch()-only
// provider doesn't have.
export const MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC = 15;

/**
 * The Medium handle can live in either `integration_config.external_id` or
 * the shared studio env var `NUXT_MEDIUM_USERNAME` — the DB row wins when
 * set. Not a secret (a public @handle, not a credential) — read directly,
 * same as GA4's client email. See ../configResolution.ts for the shared
 * row-overrides-default precedent this follows.
 */
function resolveUsername(config: IntegrationConfig): string | null {
  return resolveExternalIdOrEnvVar(config, "NUXT_MEDIUM_USERNAME");
}

async function fetchArticleDetails(
  articleIds: string[],
  fetchArticleInfo: FetchMediumArticleInfo,
): Promise<SyndicationSourcePost[]> {
  const boundedIds = articleIds.slice(0, MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC);
  // Sequential, not Promise.all: mediumapi.com's plans are typically
  // rate-limited per second as well as per month, and this provider has no
  // visibility into that per-second ceiling — firing every detail request
  // at once risks a burst of 429s (which would also still count against the
  // monthly cap for no data in return). One at a time trades a slower sync
  // (this runs in the background, on a schedule — latency isn't
  // user-facing) for not needing to guess at a safe concurrency limit.
  const posts: SyndicationSourcePost[] = [];
  for (const articleId of boundedIds) {
    const info = await fetchArticleInfo(articleId);
    posts.push(toSyndicationSourcePost(info));
  }
  return posts;
}

/**
 * Core fetch logic, decoupled from the real Medium client so it can be unit
 * tested against fixture-backed `ListMediumArticleIds`/
 * `FetchMediumArticleInfo` with no network call — `createMediumProvider`
 * below is the only caller that wires in the real ones (mediumClient.ts).
 */
export async function fetchMediumSyndication(
  listArticleIds: ListMediumArticleIds,
  fetchArticleInfo: FetchMediumArticleInfo,
): Promise<ProviderResult> {
  const articleIds = await listArticleIds();
  const posts = await fetchArticleDetails(articleIds, fetchArticleInfo);
  // The `posts` metric reports the platform's true total (articleIds.length)
  // even though `posts` (the syndication_post rows) is bounded — see
  // MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC's comment.
  return buildSyndicationResult(MEDIUM_VENDOR, posts, articleIds.length);
}

async function defaultGetLastSuccessfulSyncAt(
  slug: string,
): Promise<Date | null> {
  return fetchLatestMetricCapturedAt(
    useDb(),
    slug,
    MEDIUM_VENDOR,
    METRIC_POSTS,
  );
}

export interface CreateMediumProviderOptions {
  // Overridable for tests; production wiring defers to
  // defaultGetLastSuccessfulSyncAt, which lazily calls useDb() only once
  // fetch() actually runs (never at provider-construction/module-load time —
  // see providers/index.ts, which builds every provider, including this
  // one, at import time with no Nitro request context available yet).
  getLastSuccessfulSyncAt?: (slug: string) => Promise<Date | null>;
  now?: () => Date;
}

/**
 * Builds the Medium IntegrationProvider. A factory (unlike stripeProvider/
 * ga4Provider's plain exported objects) because, uniquely among these three
 * platforms, it needs an injectable "when did this last actually succeed"
 * lookup for its rate-limit guard — see mediumSyncGuard.ts and
 * server/utils/dashboardQueries.ts's fetchLatestMetricCapturedAt.
 */
export function createMediumProvider(
  options: CreateMediumProviderOptions = {},
): IntegrationProvider {
  const getLastSuccessfulSyncAt =
    options.getLastSuccessfulSyncAt ?? defaultGetLastSuccessfulSyncAt;
  const now = options.now ?? (() => new Date());

  return {
    vendor: MEDIUM_VENDOR,
    async fetch(config: IntegrationConfig): Promise<ProviderResult> {
      // NAMED ASSUMPTION (issue #17): unlike Hashnode/DEV.to/Stripe/GA4
      // (which throw when an *enabled* row is missing its secret — a real
      // misconfiguration, since those vendors' secretRef should already
      // resolve), a missing Medium key resolves to silently empty rather
      // than an error. Medium's read path is a paid third-party add-on
      // (mediumapi.com) Dan may not have subscribed to yet, so an enabled
      // danholloran/medium row with no key configured is "not yet
      // provisioned," not a bug — the same way a property with no Clerk
      // instance configured shows no Clerk data instead of failing sync.
      if (!config.secret) {
        return emptySyndicationResult();
      }
      const username = resolveUsername(config);
      if (!username) {
        return emptySyndicationResult();
      }

      const lastSuccessfulSyncAt = await getLastSuccessfulSyncAt(config.slug);
      if (!isMediumSyncDue(now(), lastSuccessfulSyncAt)) {
        return emptySyndicationResult();
      }

      const listArticleIds = createMediumArticleIdLister(
        username,
        config.secret,
      );
      const fetchArticleInfo = createMediumArticleInfoFetcher(config.secret);
      return fetchMediumSyndication(listArticleIds, fetchArticleInfo);
    },
  };
}

export const mediumProvider: IntegrationProvider = createMediumProvider();
