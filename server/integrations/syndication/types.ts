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
