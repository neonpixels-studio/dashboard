import type { SyndicationSourcePost } from "../types";
import type { HashnodePostNode } from "./types";

/**
 * Translates one Hashnode GraphQL post node into the shared
 * SyndicationSourcePost shape. `slug` is Hashnode's own human-readable post
 * slug — see ../types.ts's SyndicationSourcePost.postRef comment for the
 * cross-platform same-slug assumption this relies on. Fails loud on a
 * missing/blank publishedAt rather than silently mapping it to `Invalid
 * Date`, which would otherwise sort/serialize unpredictably downstream.
 */
export function toSyndicationSourcePost(
  node: HashnodePostNode,
): SyndicationSourcePost {
  const publishedAt = new Date(node.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error(
      `Hashnode post "${node.id}" has an unparseable publishedAt value: "${node.publishedAt}".`,
    );
  }

  return { postRef: node.slug, publishedAt };
}
