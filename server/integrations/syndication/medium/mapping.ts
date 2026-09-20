import { assertValidDate } from "../dates";
import type { SyndicationSourcePost } from "../types";
import type { MediumArticleInfo } from "./types";

// Medium's own unique_slug carries a trailing per-article hash Hashnode/
// DEV.to's plain slugs don't have (e.g. "my-post-title-1a2b3c4d5e6f" vs
// "my-post-title") — stripped here so postRef still matches the SAME
// human-chosen slug those platforms report, per ../types.ts's
// SyndicationSourcePost.postRef cross-platform same-slug assumption. `{10,12}`
// (not a fixed 12) since the exact hash length is unverified and older
// Medium post ids are documented elsewhere as slightly shorter — kept
// narrow rather than widened further (e.g. `{8,}`) so a slug that
// legitimately ends in a hex-looking number (e.g.
// "year-in-review-20252026") doesn't get misread as Medium's hash and
// merged with an unrelated post. UNVERIFIED against a live response (see
// ./types.ts's file comment) — confirm this pattern still holds the first
// time a real Medium sync runs; toPostRef falls back to the raw slug (a
// degraded, Medium-only matrix row rather than a crash) if it ever doesn't
// match at all.
const MEDIUM_SLUG_HASH_SUFFIX_PATTERN = /-[0-9a-f]{10,12}$/;

export function toPostRef(uniqueSlug: string): string {
  return uniqueSlug.replace(MEDIUM_SLUG_HASH_SUFFIX_PATTERN, "");
}

// Anchored at both ends (unlike a prefix-only check) so a full ISO string
// that merely STARTS the same way (e.g. "2026-09-01T12:00:00.000Z") is never
// mistaken for this bare, timezone-less form — appending "Z" to a string
// that already carries one would otherwise produce an invalid "...ZZ" and
// fail every sync.
const SPACE_SEPARATED_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * `published_at` is genuinely unverified as either epoch milliseconds or a
 * bare "YYYY-MM-DD HH:mm:ss" UTC string with no timezone marker (see
 * ./types.ts) — handles both rather than betting on one. Only the
 * space-separated form gets a "Z" appended (it has no timezone marker of
 * its own, so `Date` would otherwise parse it as local time); any other
 * string — including a full ISO 8601 string, which already carries a "Z" or
 * offset — is handed to `Date` unmodified.
 */
function parsePublishedAt(publishedAt: number | string): Date {
  if (typeof publishedAt === "number") {
    return new Date(publishedAt);
  }
  if (SPACE_SEPARATED_DATE_TIME_PATTERN.test(publishedAt)) {
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
