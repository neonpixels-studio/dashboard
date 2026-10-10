import type { ProviderResult } from "../types";

// Plain, JSON-serializable shape every blog-syndication platform (Hashnode,
// DEV.to, Medium) normalizes its own response into. Each platform's own
// <platform>/mapping.ts is the one place that translates the real API
// response into this narrower shape; ./normalize.ts and every provider.ts
// (and their tests) only ever see this file's type — mirrors
// server/integrations/stripe/types.ts's StripeSubscription split and
// server/integrations/ga4/types.ts's Ga4ReportRow split.
export interface SyndicationSourcePost {
  // The identifier this repo correlates the SAME logical post by across
  // platforms. NAMED ASSUMPTION: cross-posted content is published under the
  // same human-chosen slug on every target (the ordinary cross-posting
  // convention) — see each platform's mapping.ts for how its own id/slug is
  // normalized into this value (Medium's mapping.ts documents the one
  // platform where that assumption needs help: Medium's slug carries a
  // trailing per-article hash Hashnode/DEV.to don't have).
  // server/utils/dashboardShaping.ts's syndicationMatrixForApp groups purely
  // by this value into one matrix row per local post, so a platform that
  // can't produce a matching value will render as its own separate row
  // rather than merging into the cross-posted one — a degraded-but-safe
  // outcome, not a crash.
  postRef: string;
  publishedAt: Date;
  // Lifetime views. Omitted when the platform didn't report a usable count.
  views?: number;
  // The platform's own article id. Only Medium sets it; see
  // syndication_post.external_id in server/db/schema.ts.
  externalId?: string;
  // The platform's own public URL for the post. Omitted when the platform's
  // response carried none; the matrix then shows the cell unlinked.
  url?: string;
  // Likes/reactions/claps and comment/response counts. Omitted when the
  // platform didn't report a usable count, never a fabricated zero.
  likes?: number;
  comments?: number;
}

/**
 * True for the non-negative integers a platform reports for a count. Shared by
 * every mapping so a missing, negative, or non-numeric field maps to "not
 * reported" instead of a fabricated zero.
 */
export function isReportedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Spreads `{ [key]: value }` only when `value` is a reported count, so
 * optional engagement fields are left off the post entirely when absent.
 */
export function reportedCount<Key extends "views" | "likes" | "comments">(
  key: Key,
  value: unknown,
): Partial<Record<Key, number>> {
  return isReportedCount(value)
    ? ({ [key]: value } as Record<Key, number>)
    : {};
}

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * True for a parseable http(s) URL, so the matrix never links to a
 * script-scheme, relative, or truncated value.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = URL.parse(value);
  return parsed !== null && HTTP_PROTOCOLS.has(parsed.protocol);
}

/**
 * Spreads `{ url }` only when the platform returned a non-empty http(s) URL,
 * so the matrix never links to a malformed or script-scheme value.
 */
function reportedUrl(value: unknown): { url?: string } {
  return isHttpUrl(value) ? { url: value } : {};
}

/**
 * The url/likes/comments trio every platform mapping reports, each field
 * dropped unless it is well-formed. Pass each platform's own field names in.
 */
export function reportedEngagement(source: {
  url?: unknown;
  likes?: unknown;
  comments?: unknown;
}): Pick<SyndicationSourcePost, "url" | "likes" | "comments"> {
  return {
    ...reportedUrl(source.url),
    ...reportedCount("likes", source.likes),
    ...reportedCount("comments", source.comments),
  };
}

/**
 * Builds a fresh, empty ProviderResult. A shared function — not a shared
 * module-level constant — for the same reason
 * server/integrations/providers/mock.ts's fetch() builds a fresh object on
 * every call: the result flows into orchestrator code that may reasonably
 * mutate it, so a singleton would let one caller's mutation leak into every
 * other caller and every later sync run.
 */
export function emptySyndicationResult(): ProviderResult {
  return { metrics: [], trafficBreakdown: [], syndicationPosts: [] };
}

// What a provider returns when its own guard skipped the real fetch. See
// ProviderResult.skipped for how the orchestrator records it.
export function skippedSyndicationResult(): ProviderResult {
  return { ...emptySyndicationResult(), skipped: true };
}
