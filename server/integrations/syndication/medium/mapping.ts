import type { SyndicationSourcePost } from "../types";
import type { MediumArticleInfo } from "./types";

// Medium's own unique_slug carries a trailing per-article hash Hashnode/
// DEV.to's plain slugs don't have (e.g. "my-post-title-1a2b3c4d5e6f" vs
// "my-post-title") — stripped here so postRef still matches the SAME
// human-chosen slug those platforms report, per ../types.ts's
// SyndicationSourcePost.postRef cross-platform same-slug assumption.
// UNVERIFIED against a live response (see ./types.ts's file comment) —
// confirm this pattern still holds the first time a real Medium sync runs;
// toPostRef falls back to the raw slug (a degraded, Medium-only matrix row
// rather than a crash) if it ever doesn't.
const MEDIUM_SLUG_HASH_SUFFIX_PATTERN = /-[0-9a-f]{12}$/;

export function toPostRef(uniqueSlug: string): string {
  return uniqueSlug.replace(MEDIUM_SLUG_HASH_SUFFIX_PATTERN, "");
}

/**
 * Translates one Medium article-info response into the shared
 * SyndicationSourcePost shape. Fails loud on a missing/non-finite
 * published_at rather than silently mapping it to `Invalid Date`, which
 * would otherwise sort/serialize unpredictably downstream.
 */
export function toSyndicationSourcePost(
  info: MediumArticleInfo,
): SyndicationSourcePost {
  const publishedAt = new Date(info.published_at);
  if (
    !Number.isFinite(info.published_at) ||
    Number.isNaN(publishedAt.getTime())
  ) {
    throw new Error(
      `Medium article "${info.unique_slug}" has an unparseable published_at value: ${info.published_at}.`,
    );
  }

  return { postRef: toPostRef(info.unique_slug), publishedAt };
}
