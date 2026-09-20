import { assertValidDate } from "../dates";
import type { SyndicationSourcePost } from "../types";
import type { DevtoArticle } from "./types";

/**
 * Translates one DEV.to/Forem article into the shared SyndicationSourcePost
 * shape. `slug` is DEV.to's own human-readable article slug — see
 * ../types.ts's SyndicationSourcePost.postRef comment for the cross-platform
 * same-slug assumption this relies on. DEV.to only appends a random suffix
 * to a slug when the plain title-derived one collides with an existing
 * article of the SAME author, so this holds for the common case; a
 * collision-suffixed slug degrades to its own Medium-style separate matrix
 * row rather than merging (same documented fallback as a Medium slug whose
 * hash-suffix doesn't strip cleanly) rather than crashing. A future
 * improvement, if that turns out to matter in practice, is matching on
 * `canonical_url` instead (DEV.to reports it, and it should be the shared
 * cross-post URL when Dan sets a canonical link on every target) — flagged
 * as a follow-up, not implemented here since it's unverified whether
 * Hashnode's API exposes the same field.
 */
export function toSyndicationSourcePost(
  article: DevtoArticle,
): SyndicationSourcePost {
  const publishedAt = assertValidDate(
    new Date(article.published_at),
    () =>
      `DEV.to article ${article.id} has an unparseable published_at value: "${article.published_at}".`,
  );

  return { postRef: article.slug, publishedAt };
}
