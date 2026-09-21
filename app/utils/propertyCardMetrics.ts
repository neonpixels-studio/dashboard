// Curates `AppCard.metrics`/`sparklines` (GET /api/apps' generic "every
// metric found for this app" list, per shared/types/dashboard.ts) down to
// the fixed set PropertyCard.vue actually renders: up to
// PROPERTY_CARD_STAT_COUNT stat slots, plus the one sparkline series drawn
// beside them. Pure data selection/formatting — no Vue — so it's
// unit-testable without mounting PropertyCard.
//
// The metric/period name strings below mirror server/utils/
// dashboardMetrics.ts's canonical list by hand — this file lives under
// app/, which can't import server/ code across the Nitro/client boundary
// (only #shared/ crosses it, and #shared/types/dashboard.ts only types the
// *shape* of a metric row, not which literal names exist).
import type {
  CurrentMetric,
  HealthTone,
  IntegrationHealth,
  MetricSeries,
} from "#shared/types/dashboard";
import { PROPERTY_CARD_STAT_COUNT } from "./appViewModel";
import {
  formatCompactCount,
  formatCount,
  formatCurrency,
} from "./rollupFormat";

const METRIC_MRR = "mrr";
const METRIC_ACTIVE_SUBSCRIBERS = "active_subscribers";
const METRIC_SESSIONS = "sessions";
const METRIC_OPEN_ISSUES = "open_issues";
const METRIC_FATAL_ISSUES = "fatal_issues";
const METRIC_USERS = "users";
const METRIC_POSTS = "posts";

const PERIOD_CURRENT = "current";
const PERIOD_30D = "30d";

interface StatPriorityEntry {
  metric: string;
  preferredPeriod: string;
}

// Revenue first, then audience size, then health, then engagement/content —
// one ranking shared by every app template rather than a separate list per
// `AppTemplate`. AppCard.metrics only ever contains whichever integrations
// are actually configured for that app, so a marketing site with no
// Stripe/Clerk config naturally falls through the money/audience entries
// and surfaces issues/sessions instead — no per-template branching needed.
// Issues rank above sessions/posts so a product app's card reads MRR / USERS
// / ISSUES (matching the original design mockup) rather than bumping
// ISSUES for a less urgent engagement number.
const STAT_PRIORITY: readonly StatPriorityEntry[] = [
  { metric: METRIC_MRR, preferredPeriod: PERIOD_CURRENT },
  { metric: METRIC_ACTIVE_SUBSCRIBERS, preferredPeriod: PERIOD_CURRENT },
  { metric: METRIC_USERS, preferredPeriod: PERIOD_CURRENT },
  { metric: METRIC_OPEN_ISSUES, preferredPeriod: PERIOD_CURRENT },
  { metric: METRIC_SESSIONS, preferredPeriod: PERIOD_30D },
  { metric: METRIC_POSTS, preferredPeriod: PERIOD_CURRENT },
];

const METRIC_LABELS: Record<string, string> = {
  [METRIC_MRR]: "MRR",
  [METRIC_ACTIVE_SUBSCRIBERS]: "USERS",
  [METRIC_USERS]: "USERS",
  [METRIC_SESSIONS]: "SESSIONS",
  [METRIC_OPEN_ISSUES]: "ISSUES",
  [METRIC_FATAL_ISSUES]: "FATAL",
  [METRIC_POSTS]: "POSTS",
};

const METRIC_FORMATTERS: Record<string, (value: number) => string> = {
  [METRIC_MRR]: formatCurrency,
  [METRIC_ACTIVE_SUBSCRIBERS]: formatCount,
  [METRIC_USERS]: formatCount,
  [METRIC_SESSIONS]: formatCompactCount,
  [METRIC_OPEN_ISSUES]: formatCount,
  [METRIC_FATAL_ISSUES]: formatCount,
  [METRIC_POSTS]: formatCount,
};

// The best row for one priority entry: exact (metric, preferredPeriod) match
// if the app has one, otherwise whichever period it does have — a metric
// existing at a different period than usual (e.g. sessions only at "7d" for
// a brand-new property) is still worth surfacing rather than skipping.
function bestMatchForMetric(
  metrics: CurrentMetric[],
  entry: StatPriorityEntry,
): CurrentMetric | undefined {
  const candidates = metrics.filter(
    (candidate) => candidate.metric === entry.metric,
  );
  if (!candidates.length) {
    return undefined;
  }
  return (
    candidates.find(
      (candidate) => candidate.period === entry.preferredPeriod,
    ) ?? candidates[0]
  );
}

// Never returns two entries with the same `metric` name: STAT_PRIORITY has
// no repeated metric, and bestMatchForMetric picks at most one row per
// entry — so PropertyCard.vue's `metric-period` render key can never
// collide within this output. Apps with fewer than PROPERTY_CARD_STAT_COUNT
// synced metrics simply render fewer stats rather than padding with
// fabricated ones.
export function selectCardStats(metrics: CurrentMetric[]): CurrentMetric[] {
  const prioritized = STAT_PRIORITY.flatMap((entry) => {
    const match = bestMatchForMetric(metrics, entry);
    return match ? [match] : [];
  });
  return prioritized.slice(0, PROPERTY_CARD_STAT_COUNT);
}

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric.replace(/_/g, " ").toUpperCase();
}

export function formatMetricValue(metric: CurrentMetric): string {
  const formatter = METRIC_FORMATTERS[metric.metric] ?? formatCount;
  return formatter(metric.value);
}

// Only the two issue-shaped metrics carry a health tone — money/audience
// stats render in the card's default ink color. Matches the original design
// (PropertyCard.vue's pre-view-model-seam history): `AppStat.tone` was only
// ever set on the "ISSUES" stat, never MRR/USERS.
export function metricTone(metric: CurrentMetric): HealthTone | undefined {
  if (
    metric.metric !== METRIC_OPEN_ISSUES &&
    metric.metric !== METRIC_FATAL_ISSUES
  ) {
    return undefined;
  }
  return metric.value > 0 ? "danger" : "ok";
}

// The sparkline beside the stats row draws whichever series the card is
// already leading with (its first curated stat), so the number and the
// trend line agree — falls back to the first available series if that exact
// (metric, period) has no history yet, and to nothing at all if the app has
// no series data synced.
export function selectSparklineSeries(
  sparklines: MetricSeries[],
  primaryStat: CurrentMetric | undefined,
): MetricSeries | null {
  if (primaryStat) {
    const matching = sparklines.find(
      (series) =>
        series.metric === primaryStat.metric &&
        series.period === primaryStat.period,
    );
    if (matching) {
      return matching;
    }
  }
  return sparklines[0] ?? null;
}

// "+ CONNECT STRIPE" for a configured-but-disabled vendor (integration_config
// row exists with enabled: false — the studio's "not turned on yet" state,
// per server/integrations/config.ts), "STRIPE" for one that's live. A vendor
// with no config row at all for this app never reaches this function: GET
// /api/apps only returns rows that exist (server/utils/dashboardShaping.ts's
// integrationHealthForApp), so there's no "unconfigured" case to fabricate a
// label for here.
export function integrationChipLabel(
  integration: Pick<IntegrationHealth, "vendor" | "enabled">,
): string {
  const upperVendor = integration.vendor.toUpperCase();
  return integration.enabled ? upperVendor : `+ CONNECT ${upperVendor}`;
}
