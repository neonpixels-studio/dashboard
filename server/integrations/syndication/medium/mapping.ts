import { assertValidDate } from "../dates";
import type { SyndicationSourcePost } from "../types";
import type { MediumArticleInfo } from "./types";

// Medium's own unique_slug carries a trailing per-article hash Hashnode/
// DEV.to's plain slugs don't have (e.g. "my-post-title-1a2b3c4d5e6f" vs
// "my-post-title") — stripped here so postRef still matches the SAME
// human-chosen slug those platforms report, per ../types.ts's
// SyndicationSourcePost.postRef cross-platform same-slug assumption. `{8,}`
// (not a fixed 12) since the exact hash length is unverified and older
// Medium post ids are documented elsewhere as shorter. UNVERIFIED against a
// live response (see ./types.ts's file comment) — confirm this pattern
// still holds the first time a real Medium sync runs; toPostRef falls back
// to the raw slug (a degraded, Medium-only matrix row rather than a crash)
// if it ever doesn't match at all.
const MEDIUM_SLUG_HASH_SUFFIX_PATTERN = /-[0-9a-f]{8,}$/;

export function toPostRef(uniqueSlug: string): string {
  return uniqueSlug.replace(MEDIUM_SLUG_HASH_SUFFIX_PATTERN, "");
}

const DATE_TIME_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;

/**
 * `published_at` is genuinely unverified as either epoch milliseconds or a
 * "YYYY-MM-DD HH:mm:ss" UTC string (see ./types.ts) — handles both rather
 * than betting on one. The string form is normalized to ISO 8601 (a literal
 * space instead of "T", or already-ISO) before parsing so `Date` treats it
 * as UTC instead of the runtime's local timezone.
 */
function parsePublishedAt(publishedAt: number | string): Date {
  if (typeof publishedAt === "number") {
    return new Date(publishedAt);
  }
  if (DATE_TIME_STRING_PATTERN.test(publishedAt)) {
    return new Date(`${publishedAt.replace(" ", "T")}Z`);
  }
  return new Date(publishedAt);
}

/**
 * Translates one Medium article-info response into the shared
 * SyndicationSourcePost shape.
 */
export function toSyndicationSourcePost(
  info: MediumArticleInfo,
): SyndicationSourcePost {
  const publishedAt = assertValidDate(
    parsePublishedAt(info.published_at),
    () =>
      `Medium article "${info.unique_slug}" has an unparseable published_at value: ${info.published_at}.`,
  );

  return { postRef: toPostRef(info.unique_slug), publishedAt };
}
