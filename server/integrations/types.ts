import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  integrationConfig,
  metricSnapshot,
  stripeEvent,
  stripePlanRevenue,
  syndicationPost,
  trafficBreakdown,
} from "../db/schema";

// The full integration_config row as Drizzle sees it, before secrets are
// resolved. Only server/integrations/config.ts should need this type.
export type IntegrationConfigRow = InferSelectModel<typeof integrationConfig>;

// What a provider actually receives: the config row's identifying fields
// plus a single resolved `secret` (either the shared env var named by
// `secretRef` or the plaintext from `encryptedSecret` — see
// server/integrations/config.ts). Providers never see which source it came
// from, so they can't accidentally branch on it.
//
// `vendor` is plain `string`, not the `integrationVendor` DB enum: a
// provider like the reference mock below (or a future metrics-only source,
// e.g. GitHub issue counts) has no `integration_config` row at all, matching
// the free-text `vendor` columns on metric_snapshot/sync_status.
export interface IntegrationConfig {
  slug: string;
  vendor: string;
  externalId: string | null;
  secret: string | null;
}

// Each input type is the insertable shape of its schema table, minus the
// columns the orchestrator (not the provider) owns: `id` (generated) and
// `slug` (the orchestrator already knows which app it's syncing). Deriving
// from the table definitions — rather than hand-listing fields — means a
// schema change to any of these tables is reflected here automatically.
//
// `capturedAt` is re-widened to required even though `defaultNow()` makes it
// optional at the DB/InferInsertModel level: persist.ts's upsert key (and
// GA4's daily-backfill semantics, see ga4/provider.ts) depend on every
// provider stamping its own explicit per-row timestamp rather than letting
// Postgres default it to "now" for every row in a batch. `Required<Pick<...>>`
// (rather than hardcoding `capturedAt: Date`) keeps the column's own type
// derived from the table definition, same as every other field here.
export type MetricSnapshotInput = Omit<
  InferInsertModel<typeof metricSnapshot>,
  "id" | "slug"
> &
  Required<Pick<InferInsertModel<typeof metricSnapshot>, "capturedAt">>;
export type TrafficBreakdownInput = Omit<
  InferInsertModel<typeof trafficBreakdown>,
  "id" | "slug"
>;
export type SyndicationPostInput = Omit<
  InferInsertModel<typeof syndicationPost>,
  "id" | "slug"
>;

// Stripe-only detail rows (the money panel's revenue-by-plan and recent
// events). `slug` is stamped by the orchestrator like the inputs above;
// `capturedAt` is left to the column default.
export type StripePlanRevenueInput = Omit<
  InferInsertModel<typeof stripePlanRevenue>,
  "id" | "slug" | "capturedAt"
>;
export type StripeEventInput = Omit<
  InferInsertModel<typeof stripeEvent>,
  "id" | "slug"
>;

// Normalized shape every provider returns, regardless of vendor. The
// orchestrator maps each array onto its matching table and stamps `slug` on
// the way in. A provider that doesn't produce a given kind of data (e.g. a
// metrics-only vendor) returns an empty array for it, never omits the key.
export interface ProviderResult {
  metrics: MetricSnapshotInput[];
  trafficBreakdown: TrafficBreakdownInput[];
  syndicationPosts: SyndicationPostInput[];
  // Present only when the Stripe provider ran a real detail fetch. When
  // present, `planRevenue` REPLACES the app's stored plan rows (an empty list
  // means "no active subscriptions", not "nothing fetched"); when absent the
  // stored rows are left untouched.
  stripeDetail?: {
    planRevenue: StripePlanRevenueInput[];
    events: StripeEventInput[];
  };
  // True when the provider's own guard decided no real fetch was due this
  // tick (Medium's once-per-24h rate limit). The orchestrator then records
  // the run without overwriting the last real attempt's ok/error, so a
  // failure stays visible until the next real attempt instead of being
  // masked by the skipped ticks after it.
  skipped?: boolean;
}

// Shared per-run deadline threaded into every provider.fetch call (see
// orchestrator.ts's runSync) — bounds an individual provider's own request(s)
// against the run's OWN budget, not just how long the batching loop spends
// admitting new batches (see orchestrator.ts's DEFAULT_RUN_BUDGET_MS
// comment for the gap this closes: a single row's own per-request timeout,
// e.g. STRIPE_REQUEST_TIMEOUT_MS at 20s, could otherwise push a run well
// past the batch-admission ceiling on its own).
//
// `signal` fires the moment the shared budget is exhausted — clients built
// on the native `fetch` API (sentryClient.ts, syndication/httpClient.ts)
// combine it with their own per-request timeout controller via
// `AbortSignal.any`. `remainingMs()` is for SDK clients whose call options
// accept a numeric per-call timeout instead of an AbortSignal (GA4's gax
// `CallOptions`, Stripe's `RequestOptions`) — each caps its own fixed
// per-request timeout constant to whichever is smaller: that constant, or
// whatever's left of the shared budget.
export interface FetchDeadline {
  signal: AbortSignal;
  remainingMs(): number;
}

// Effectively-infinite deadline: `signal` never aborts, `remainingMs()` is
// always Infinity (so `Math.min(ownTimeoutMs, remainingMs())` reduces to
// `ownTimeoutMs`, unchanged from before this parameter existed). Used as
// every deadline-accepting client function's default, so exercising a
// provider/client directly (every existing unit test) needs no deadline at
// all — only orchestrator.ts's runSync ever needs to build a real one.
// A dedicated AbortController's signal, not a bare object literal, so it's a
// real AbortSignal instance `AbortSignal.any` can combine like any other.
const NEVER_ABORTS = new AbortController();
export const NO_DEADLINE: FetchDeadline = {
  signal: NEVER_ABORTS.signal,
  remainingMs: () => Number.POSITIVE_INFINITY,
};

// The contract every vendor integration implements. Providers are pure data
// fetchers: no DB writes, no orchestration — `fetch` takes a resolved config
// and returns normalized data, so each provider is unit-testable in
// isolation from the DB and from every other vendor. `deadline` is optional
// here (defaulting to NO_DEADLINE inside whichever providers actually thread
// it into a real client — see FetchDeadline's comment) so a provider whose
// underlying SDK has no timeout/signal seam to adapt yet (e.g. Clerk) can
// keep its existing single-argument `fetch` unchanged; the orchestrator
// always passes a real one regardless of what any given provider does with
// it.
export interface IntegrationProvider {
  vendor: string;
  fetch(
    config: IntegrationConfig,
    deadline?: FetchDeadline,
  ): Promise<ProviderResult>;
}
