import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  integrationConfig,
  metricSnapshot,
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

// Normalized shape every provider returns, regardless of vendor. The
// orchestrator maps each array onto its matching table and stamps `slug` on
// the way in. A provider that doesn't produce a given kind of data (e.g. a
// metrics-only vendor) returns an empty array for it, never omits the key.
export interface ProviderResult {
  metrics: MetricSnapshotInput[];
  trafficBreakdown: TrafficBreakdownInput[];
  syndicationPosts: SyndicationPostInput[];
}

// The contract every vendor integration implements. Providers are pure data
// fetchers: no DB writes, no orchestration — `fetch` takes a resolved config
// and returns normalized data, so each provider is unit-testable in
// isolation from the DB and from every other vendor.
export interface IntegrationProvider {
  vendor: string;
  fetch(config: IntegrationConfig): Promise<ProviderResult>;
}
