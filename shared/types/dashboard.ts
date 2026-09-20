// Response contracts for the read-side dashboard API (server/api/overview,
// server/api/apps, server/api/apps/[slug]). Lives under `shared/` so the
// Nuxt frontend data layer (issue #11) can import these types directly
// instead of re-declaring them. Every numeric field here is sourced from
// `metric_snapshot` / `traffic_breakdown` / `syndication_post` /
// `sync_status` — never fabricated — so a `null` genuinely means "no data
// synced yet", not zero.

export interface MetricPoint {
  capturedAt: string;
  value: number;
}

// One (metric, period) time series for a single app, e.g. the last 60 days
// of `sessions` snapshots — the source a sparkline is drawn from.
export interface MetricSeries {
  metric: string;
  period: string;
  points: MetricPoint[];
}

// The latest known value for one (metric, period). A metric with no data
// yet simply has no entry in the `metrics`/`sparklines` array it belongs to
// — there's no "empty" CurrentMetric, so every field here is always real.
export interface CurrentMetric {
  metric: string;
  period: string;
  value: number;
  capturedAt: string;
}

export interface TrafficChannelSplit {
  channel: string;
  pct: number;
}

export interface AppMetricSplit {
  slug: string;
  value: number;
}

export type HealthTone = "ok" | "warn" | "danger" | "muted";

export interface AppStatus {
  label: string;
  tone: HealthTone;
}

// One integration_config row for an app, joined with its latest sync_status
// (if any poll has ever run for that vendor).
export interface IntegrationHealth {
  vendor: string;
  enabled: boolean;
  ok: boolean | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
}

// A sync_status row shaped for the "sources" footer — every vendor that has
// ever synced for this app, whether or not it's still enabled.
export interface SyncSource {
  vendor: string;
  ok: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
}

export interface AppAlert {
  slug: string;
  vendor: string;
  message: string;
  occurredAt: string | null;
}

export interface SyndicationMatrixCell {
  platform: string;
  status: "synced" | "pending" | "failed";
  syncedAt: string | null;
}

// One row of the syndication matrix: a single local post and its status on
// every platform it's been cross-posted to.
export interface SyndicationMatrixRow {
  postRef: string;
  cells: SyndicationMatrixCell[];
}

// A rollup metric aggregated across every app. `period`/`capturedAt` mirror
// whichever underlying row is most recent — both null when no app has any
// data for the metric yet.
export interface OverviewMetric {
  value: number | null;
  period: string | null;
  capturedAt: string | null;
}

// GET /api/overview. Every rollup pairs its studio-wide total with the
// per-app numbers it was built from (`mrr` included — the issue only calls
// out a per-app split as required for active subscribers/open issues, but
// computing one for MRR is free alongside the total, so it's shipped too).
export interface OverviewResponse {
  mrr: OverviewMetric & { byApp: AppMetricSplit[] };
  activeSubscribers: OverviewMetric & { byApp: AppMetricSplit[] };
  sessions30d: OverviewMetric & { bySource: TrafficChannelSplit[] };
  openIssues: OverviewMetric & { byApp: AppMetricSplit[] };
  lastSyncedAt: string | null;
}

// One entry of GET /api/apps — per-property card data. `metrics`/
// `sparklines` are generic (every metric found for the app, not a fixed
// list) so the frontend picks which ones a given template cares about.
export interface AppCard {
  slug: string;
  status: AppStatus;
  metrics: CurrentMetric[];
  sparklines: MetricSeries[];
  integrations: IntegrationHealth[];
}

export type AppsResponse = AppCard[];

// GET /api/apps/[slug]
export interface AppDetailResponse {
  slug: string;
  metrics: CurrentMetric[];
  series: MetricSeries[];
  trafficBreakdown: TrafficChannelSplit[];
  syndication: SyndicationMatrixRow[];
  alerts: AppAlert[];
  sources: SyncSource[];
  lastSyncedAt: string | null;
}
