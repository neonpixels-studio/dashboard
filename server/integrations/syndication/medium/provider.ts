import { useDb } from "../../../db";
import { METRIC_POSTS } from "../../../utils/dashboardMetrics";
import {
  fetchLastAttemptedSyncAt,
  fetchLatestMetricCapturedAt,
  fetchSyndicationExternalIds,
} from "../../../utils/dashboardQueries";
import { recordSyncAttempt } from "../../persist";
import { NO_DEADLINE } from "../../types";
import type {
  FetchDeadline,
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
import {
  isMediumSyncDue,
  MEDIUM_MIN_SYNC_INTERVAL_MS,
} from "./mediumSyncGuard";
import { toSyndicationSourcePost } from "./mapping";
import type { FetchMediumArticleInfo, ListMediumArticleIds } from "./types";

const MEDIUM_VENDOR = "medium";
// Bounds the per-sync request cost of fetching full article detail (title/
// slug/publishedAt), on top of the 2 flat requests createMediumArticleIdLister
// always makes — see mediumClient.ts and mediumSyncGuard.ts's rate-limit
// comment, which derives this provider's whole sync cadence FROM this
// constant to stay under mediumapi.com's 150-requests/month cap; changing
// this number without re-checking that math will blow the budget. The
// `posts` metric itself still reports the platform's true total
// (articleIds.length, free — already in hand from the id listing) so it's
// never stale/undercounted; only the syndication_post rows (and therefore
// the matrix) are bounded to the MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC
// newest articles that have no row yet each sync (see
// selectArticleIdsToFetch), so new posts land first and older ones backfill
// a couple per day.
export const MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC = 2;

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

// toPostRef (mapping.ts) strips Medium's per-article hash, so two DIFFERENT
// Medium articles that happen to share a title (e.g. two "Weekly Notes"
// posts) can collide onto the SAME postRef — left alone, that would either
// violate syndication_post's (slug, platform, post_ref) unique index and
// fail the whole persist, or silently overwrite one post's row with the
// other's on a later sync. Deduping here, keeping the most recently
// published of any collision, keeps exactly one row per postRef — the
// production-DB uniqueness rule can't be enforced any earlier than this,
// since it's a property of the STRIPPED slug, not of the raw article id.
function dedupeByPostRefKeepingLatest(
  posts: SyndicationSourcePost[],
): SyndicationSourcePost[] {
  const latestByPostRef = new Map<string, SyndicationSourcePost>();
  for (const post of posts) {
    const existing = latestByPostRef.get(post.postRef);
    if (!existing || post.publishedAt > existing.publishedAt) {
      latestByPostRef.set(post.postRef, post);
    }
  }
  return [...latestByPostRef.values()];
}

// The listing is newest first, so this picks up new posts before older ones.
// @todo an article that loses dedupeByPostRefKeepingLatest's title collision
// never gets a row, so it stays "unseen" and spends a detail request every
// sync; track fetched ids separately if that ever shows up.
function selectArticleIdsToFetch(
  articleIds: string[],
  knownArticleIds: ReadonlySet<string>,
): string[] {
  return articleIds
    .filter((articleId) => !knownArticleIds.has(articleId))
    .slice(0, MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC);
}

async function fetchArticleDetails(
  articleIds: string[],
  fetchArticleInfo: FetchMediumArticleInfo,
): Promise<SyndicationSourcePost[]> {
  // Sequential, not Promise.all: mediumapi.com's plans are typically
  // rate-limited per second as well as per month, and this provider has no
  // visibility into that per-second ceiling — firing every detail request
  // at once risks a burst of 429s (which would also still count against the
  // monthly cap for no data in return). One at a time trades a slower sync
  // (this runs in the background, on a schedule — latency isn't
  // user-facing) for not needing to guess at a safe concurrency limit.
  const posts: SyndicationSourcePost[] = [];
  for (const articleId of articleIds) {
    const info = await fetchArticleInfo(articleId);
    posts.push(toSyndicationSourcePost(info));
  }
  return dedupeByPostRefKeepingLatest(posts);
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
  knownArticleIds: ReadonlySet<string> = new Set(),
): Promise<ProviderResult> {
  const articleIds = await listArticleIds();
  const posts = await fetchArticleDetails(
    selectArticleIdsToFetch(articleIds, knownArticleIds),
    fetchArticleInfo,
  );
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

async function defaultGetLastAttemptedSyncAt(
  slug: string,
): Promise<Date | null> {
  return fetchLastAttemptedSyncAt(useDb(), slug, MEDIUM_VENDOR);
}

async function defaultGetKnownArticleIds(slug: string): Promise<Set<string>> {
  return fetchSyndicationExternalIds(useDb(), slug, MEDIUM_VENDOR);
}

// Deliberately not best-effort (unlike orchestrator.ts's
// recordSyncStatusBestEffort) and returns whether this call actually claimed
// the attempt — see recordSyncAttempt in persist.ts for why both of those
// matter (a paid, capped resource, plus an atomic claim against overlapping
// callers).
async function defaultRecordAttempt(
  slug: string,
  attemptedAt: Date,
): Promise<boolean> {
  return recordSyncAttempt(
    useDb(),
    slug,
    MEDIUM_VENDOR,
    attemptedAt,
    MEDIUM_MIN_SYNC_INTERVAL_MS,
  );
}

export interface CreateMediumProviderOptions {
  // Both overridable for tests; production wiring defers to
  // defaultGetLastSuccessfulSyncAt/defaultGetLastAttemptedSyncAt, which
  // lazily call useDb() only once fetch() actually runs (never at
  // provider-construction/module-load time — see providers/index.ts, which
  // builds every provider, including this one, at import time with no Nitro
  // request context available yet).
  getLastSuccessfulSyncAt?: (slug: string) => Promise<Date | null>;
  getLastAttemptedSyncAt?: (slug: string) => Promise<Date | null>;
  // Returns false when another concurrent call already claimed this
  // attempt window — see defaultRecordAttempt's comment.
  recordAttempt?: (slug: string, attemptedAt: Date) => Promise<boolean>;
  getKnownArticleIds?: (slug: string) => Promise<ReadonlySet<string>>;
  now?: () => Date;
}

/**
 * Builds the Medium IntegrationProvider. A factory (unlike stripeProvider/
 * ga4Provider's plain exported objects) because, uniquely among these three
 * platforms, it needs an injectable "when did this last actually succeed" AND
 * "when did this last actually try" lookup for its rate-limit guard — see
 * mediumSyncGuard.ts, server/utils/dashboardQueries.ts's
 * fetchLatestMetricCapturedAt/fetchLastAttemptedSyncAt, and
 * server/integrations/persist.ts's recordSyncAttempt.
 */
export function createMediumProvider(
  options: CreateMediumProviderOptions = {},
): IntegrationProvider {
  const getLastSuccessfulSyncAt =
    options.getLastSuccessfulSyncAt ?? defaultGetLastSuccessfulSyncAt;
  const getLastAttemptedSyncAt =
    options.getLastAttemptedSyncAt ?? defaultGetLastAttemptedSyncAt;
  const recordAttempt = options.recordAttempt ?? defaultRecordAttempt;
  const getKnownArticleIds =
    options.getKnownArticleIds ?? defaultGetKnownArticleIds;
  const now = options.now ?? (() => new Date());

  return {
    vendor: MEDIUM_VENDOR,
    async fetch(
      config: IntegrationConfig,
      deadline: FetchDeadline = NO_DEADLINE,
    ): Promise<ProviderResult> {
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

      // Read once and reused for both the guard check and the watermark
      // stamp below — two separate now() calls would let the instant that
      // was actually checked drift from the instant that gets persisted.
      const attemptAt = now();
      const [lastSuccessfulSyncAt, lastAttemptedSyncAt] = await Promise.all([
        getLastSuccessfulSyncAt(config.slug),
        getLastAttemptedSyncAt(config.slug),
      ]);
      if (
        !isMediumSyncDue(attemptAt, lastSuccessfulSyncAt, lastAttemptedSyncAt)
      ) {
        return emptySyndicationResult();
      }

      // Claimed BEFORE the real network calls below (fetchMediumSyndication),
      // not after, and not inside a try/catch around that call — the whole
      // point of this watermark is that it advances independent of whether
      // the attempt about to happen succeeds or throws, so a persistently
      // failing Medium sync still only retries once per
      // MEDIUM_MIN_SYNC_INTERVAL_HOURS instead of every orchestrator tick.
      // A false return means a concurrent call already won this attempt
      // window (see defaultRecordAttempt's comment) — bail out the same as
      // an ordinary "not due yet" rather than also making the Medium call.
      const claimedAttempt = await recordAttempt(config.slug, attemptAt);
      if (!claimedAttempt) {
        return emptySyndicationResult();
      }

      const listArticleIds = createMediumArticleIdLister(
        username,
        config.secret,
        undefined,
        deadline,
      );
      const fetchArticleInfo = createMediumArticleInfoFetcher(
        config.secret,
        undefined,
        deadline,
      );
      return fetchMediumSyndication(
        listArticleIds,
        fetchArticleInfo,
        await getKnownArticleIds(config.slug),
      );
    },
  };
}

export const mediumProvider: IntegrationProvider = createMediumProvider();
