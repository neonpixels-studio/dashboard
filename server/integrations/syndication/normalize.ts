import { METRIC_POSTS, PERIOD_CURRENT } from "../../utils/dashboardMetrics";
import type { ProviderResult } from "../types";
import type { SyndicationSourcePost } from "./types";

// A post this repo has just listed from a platform's own read API is, by
// definition, already live there — there is no "pending"/"failed" status to
// derive on the read side (those only make sense for the *publish* path,
// which this app doesn't own; see the issue's "publishing is handled outside
// this app"). A platform that can't be reached at all fails the whole
// fetch — each provider.ts lets that exception propagate per
// IntegrationProvider's no-silent-zeroing contract — rather than ever
// producing a "failed" row here.
const SYNDICATION_STATUS_SYNCED = "synced";

/**
 * Shared normalize step for every read-only syndication provider: turns one
 * platform's already-drained list of published posts into this repo's
 * `syndication_post` rows plus a single `posts` count metric_snapshot row.
 * Shared by Hashnode/DEV.to/Medium (rule of three) instead of re-implementing
 * this same mapping in each provider.ts. `postsCount` defaults to
 * `posts.length` (Hashnode/DEV.to: every listed post always gets a row, so
 * the two are the same number) but can be passed explicitly when a caller's
 * row count is bounded independently of its true total — see
 * server/integrations/syndication/medium/provider.ts's
 * MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC, which caps `posts` (rate-limit cost)
 * without making the `posts` metric itself report a stale/undercounted
 * number. Reported even when 0 — a configured platform that genuinely has no
 * posts yet is a real zero, unlike the "not configured at all" case each
 * provider's own unconfigured branch returns emptySyndicationResult() for
 * instead (see server/integrations/syndication/types.ts).
 */
export function buildSyndicationResult(
  platform: string,
  posts: SyndicationSourcePost[],
  postsCount: number = posts.length,
): ProviderResult {
  const capturedAt = new Date();

  return {
    metrics: [
      {
        vendor: platform,
        metric: METRIC_POSTS,
        value: postsCount,
        period: PERIOD_CURRENT,
        capturedAt,
      },
    ],
    trafficBreakdown: [],
    syndicationPosts: posts.map((post) => ({
      platform,
      postRef: post.postRef,
      status: SYNDICATION_STATUS_SYNCED,
      syncedAt: post.publishedAt,
    })),
  };
}
