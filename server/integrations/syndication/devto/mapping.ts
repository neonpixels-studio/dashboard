import type { SyndicationSourcePost } from "../types";
import type { DevtoArticle } from "./types";

/**
 * Translates one DEV.to/Forem article into the shared SyndicationSourcePost
 * shape. `slug` is DEV.to's own human-readable article slug — see
 * ../types.ts's SyndicationSourcePost.postRef comment for the cross-platform
 * same-slug assumption this relies on. Fails loud on a missing/blank
 * published_at rather than silently mapping it to `Invalid Date`, which
 * would otherwise sort/serialize unpredictably downstream — every article
 * this provider reads comes from the /published endpoint, so a genuinely
 * unpublished article should never reach here in the first place.
 */
export function toSyndicationSourcePost(
  article: DevtoArticle,
): SyndicationSourcePost {
  const publishedAt = new Date(article.published_at);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error(
      `DEV.to article ${article.id} has an unparseable published_at value: "${article.published_at}".`,
    );
  }

  return { postRef: article.slug, publishedAt };
}
