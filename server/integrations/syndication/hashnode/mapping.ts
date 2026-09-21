import { assertValidDate } from "../dates";
import type { SyndicationSourcePost } from "../types";
import type { HashnodePostNode } from "./types";

/**
 * Translates one Hashnode GraphQL post node into the shared
 * SyndicationSourcePost shape. `slug` is Hashnode's own human-readable post
 * slug — see ../types.ts's SyndicationSourcePost.postRef comment for the
 * cross-platform same-slug assumption this relies on.
 */
export function toSyndicationSourcePost(
  node: HashnodePostNode,
): SyndicationSourcePost {
  const publishedAt = assertValidDate(
    new Date(node.publishedAt),
    () =>
      `Hashnode post "${node.id}" has an unparseable publishedAt value: "${node.publishedAt}".`,
  );

  return { postRef: node.slug, publishedAt };
}
