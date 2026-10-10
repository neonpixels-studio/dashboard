import { assertValidDate } from "../dates";
import { reportedEngagement, type SyndicationSourcePost } from "../types";
import type { ZyvopPost } from "./types";

// ZyVOP appends a random 5-character base36 suffix to every slug (e.g.
// "map-getorinsert-stop-writing-the-has-get-set-dance-446os"). Stripped so
// postRef matches the plain slug other platforms report, same reasoning as
// ../medium/mapping.ts. Verified 2026-10-10 against all 25 published posts:
// every slug carried the suffix, so stripping it unconditionally is safe.
const ZYVOP_SLUG_SUFFIX_PATTERN = /-[a-z0-9]{5}$/;

export function toPostRef(slug: string): string {
  return slug.replace(ZYVOP_SLUG_SUFFIX_PATTERN, "");
}

export function toSyndicationSourcePost(
  post: ZyvopPost,
): SyndicationSourcePost {
  const publishedAt = assertValidDate(
    new Date(post.publishedAt),
    () =>
      `ZyVOP post ${post.id} has an unparseable publishedAt value: "${post.publishedAt}".`,
  );

  return {
    postRef: toPostRef(post.slug),
    publishedAt,
    views: post.views,
    ...reportedEngagement(post),
  };
}
