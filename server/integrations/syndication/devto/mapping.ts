import { assertValidDate } from "../dates";
import type { SyndicationSourcePost } from "../types";
import type { DevtoArticle } from "./types";

// DEV.to appends a random 3-4 character suffix to every slug (e.g.
// "css-reading-flow-fix-the-tab-order-your-layout-broke-2j2k", or "-bdd").
// Stripped so postRef matches the plain slug other platforms report, same
// reasoning as ../zyvop/mapping.ts. Verified 2026-10-10 against all 48
// published articles: every slug carried the suffix, so stripping it
// unconditionally is safe. `canonical_url` would give the exact blog slug, but
// ZyVOP has no equivalent, so it can't be the cross-platform join key.
const DEVTO_SLUG_SUFFIX_PATTERN = /-[a-z0-9]{3,4}$/;

export function toPostRef(slug: string): string {
  return slug.replace(DEVTO_SLUG_SUFFIX_PATTERN, "");
}

/**
 * Translates one DEV.to/Forem article into the shared SyndicationSourcePost
 * shape.
 */
export function toSyndicationSourcePost(
  article: DevtoArticle,
): SyndicationSourcePost {
  const publishedAt = assertValidDate(
    new Date(article.published_at),
    () =>
      `DEV.to article ${article.id} has an unparseable published_at value: "${article.published_at}".`,
  );

  return {
    postRef: toPostRef(article.slug),
    publishedAt,
    views: article.page_views_count,
  };
}
