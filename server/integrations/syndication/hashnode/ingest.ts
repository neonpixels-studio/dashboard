import type { ProviderResult } from "../../types";
import { assertValidDate } from "../dates";
import { buildSyndicationResult } from "../normalize";
import type { SyndicationSourcePost } from "../types";

// Hashnode's blog and its GraphQL API are both unreachable server-side
// (Cloudflare challenge, paid API), so a logged-in browser on the Mac Mini
// scrapes the post list and pushes it here instead of the orchestrator
// polling. See server/api/ingest/hashnode.post.ts.
export const HASHNODE_VENDOR = "hashnode";

// Bounds the payload; far beyond any personal blog's post count.
const MAX_INGEST_POSTS = 1_000;

// Hashnode slugs are lowercase words joined by hyphens. Anything else (a full
// URL, a trailing slash, a query string) means the scraper grabbed the wrong
// value and would split the post into its own matrix row.
const HASHNODE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface HashnodeIngestPost {
  slug: string;
  publishedAt: string;
  views: number;
}

export interface HashnodeIngestPayload {
  app: string;
  posts: HashnodeIngestPost[];
}

export class HashnodeIngestValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new HashnodeIngestValidationError(message);
}

function parsePost(value: unknown, index: number): HashnodeIngestPost {
  const field = `posts[${index}]`;
  if (!isRecord(value)) {
    fail(`${field} must be an object.`);
  }
  const { slug, publishedAt, views } = value;
  if (typeof slug !== "string" || !HASHNODE_SLUG_PATTERN.test(slug)) {
    fail(`${field}.slug must be a lowercase hyphenated Hashnode slug.`);
  }
  if (
    typeof publishedAt !== "string" ||
    Number.isNaN(Date.parse(publishedAt))
  ) {
    fail(`${field}.publishedAt must be an ISO 8601 date string.`);
  }
  if (typeof views !== "number" || !Number.isInteger(views) || views < 0) {
    fail(`${field}.views must be a non-negative integer.`);
  }
  return { slug, publishedAt, views };
}

function assertUniqueSlugs(posts: HashnodeIngestPost[]): void {
  const seen = new Set<string>();
  for (const post of posts) {
    if (seen.has(post.slug)) {
      fail(`posts contains duplicate slug "${post.slug}".`);
    }
    seen.add(post.slug);
  }
}

/**
 * Validates the scraper's request body. Throws HashnodeIngestValidationError
 * naming the first bad field, so the scraper can be fixed rather than the
 * dashboard silently storing a partial or mangled post list.
 */
export function parseHashnodeIngestPayload(
  body: unknown,
): HashnodeIngestPayload {
  if (!isRecord(body)) {
    fail("Body must be a JSON object.");
  }
  const { app, posts } = body;
  if (typeof app !== "string" || !app) {
    fail("app must be a non-empty string.");
  }
  if (!Array.isArray(posts)) {
    fail("posts must be an array.");
  }
  if (posts.length > MAX_INGEST_POSTS) {
    fail(`posts must have at most ${MAX_INGEST_POSTS} entries.`);
  }
  const parsedPosts = posts.map(parsePost);
  assertUniqueSlugs(parsedPosts);
  return { app, posts: parsedPosts };
}

function toSyndicationSourcePost(
  post: HashnodeIngestPost,
): SyndicationSourcePost {
  const publishedAt = assertValidDate(
    new Date(post.publishedAt),
    () =>
      `Hashnode post "${post.slug}" has an unparseable publishedAt value: "${post.publishedAt}".`,
  );
  return { postRef: post.slug, publishedAt, views: post.views };
}

export function toHashnodeProviderResult(
  payload: HashnodeIngestPayload,
): ProviderResult {
  return buildSyndicationResult(
    HASHNODE_VENDOR,
    payload.posts.map(toSyndicationSourcePost),
  );
}
