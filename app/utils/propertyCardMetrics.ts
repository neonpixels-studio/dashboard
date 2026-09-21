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
const METRIC_USERS = "users";
const METRIC_POSTS = "posts";

// Every metric name this module curates against, exported so a test can
// assert each one still appears in server/utils/dashboardMetrics.ts's
// canonical list — nothing at the Nitro/client boundary itself would catch
// the two silently drifting apart otherwise.
export const CARD_METRIC_NAMES: readonly string[] = [
  METRIC_MRR,
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_SESSIONS,
  METRIC_OPEN_ISSUES,
  METRIC_USERS,
  METRIC_POSTS,
];

const PERIOD_CURRENT = "current";
const PERIOD_30D = "30d";

interface StatPriorityEntry {
  // Every candidate metric name that fills this ONE slot, in preference
  // order — e.g. the "audience size" slot accepts either
  // active_subscribers or users, but never both at once. Kept as a list
  // (not one entry per candidate) so two candidates can never both surface
  // as separate stats with the same METRIC_LABELS text (e.g. two "USERS"
  // columns).
  metricCandidates: readonly string[];
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
  { metricCandidates: [METRIC_MRR], preferredPeriod: PERIOD_CURRENT },
  {
    metricCandidates: [METRIC_ACTIVE_SUBSCRIBERS, METRIC_USERS],
    preferredPeriod: PERIOD_CURRENT,
  },
  { metricCandidates: [METRIC_OPEN_ISSUES], preferredPeriod: PERIOD_CURRENT },
  { metricCandidates: [METRIC_SESSIONS], preferredPeriod: PERIOD_30D },
  { metricCandidates: [METRIC_POSTS], preferredPeriod: PERIOD_CURRENT },
];

const METRIC_LABELS: Record<string, string> = {
  [METRIC_MRR]: "MRR",
  [METRIC_ACTIVE_SUBSCRIBERS]: "USERS",
  [METRIC_USERS]: "USERS",
  [METRIC_SESSIONS]: "SESSIONS",
  [METRIC_OPEN_ISSUES]: "ISSUES",
  [METRIC_POSTS]: "POSTS",
};

const METRIC_FORMATTERS: Record<string, (value: number) => string> = {
  [METRIC_MRR]: formatCurrency,
  [METRIC_ACTIVE_SUBSCRIBERS]: formatCount,
  [METRIC_USERS]: formatCount,
  [METRIC_SESSIONS]: formatCompactCount,
  [METRIC_OPEN_ISSUES]: formatCount,
  [METRIC_POSTS]: formatCount,
};

// The best row for one priority entry: the first candidate metric name the
// app actually has data for (in the entry's preference order), at its exact
// (metric, preferredPeriod) if that exists, otherwise whichever period it
// does have — a metric existing at a different period than usual (e.g.
// sessions only at "7d" for a brand-new property) is still worth surfacing
// rather than skipping.
function bestMatchForEntry(
  metrics: CurrentMetric[],
  entry: StatPriorityEntry,
): CurrentMetric | undefined {
  const matchedMetricName = entry.metricCandidates.find((metricName) =>
    metrics.some((candidate) => candidate.metric === metricName),
  );
  if (!matchedMetricName) {
    return undefined;
  }
  const rowsForMetric = metrics.filter(
    (candidate) => candidate.metric === matchedMetricName,
  );
  return (
    rowsForMetric.find(
      (candidate) => candidate.period === entry.preferredPeriod,
    ) ?? rowsForMetric[0]
  );
}

// Never returns two entries with the same `metric` name: each
// STAT_PRIORITY entry fills exactly one slot (even one with multiple
// candidate metric names — e.g. active_subscribers/users never both
// surface at once), and bestMatchForEntry picks at most one row per entry
// — so PropertyCard.vue's `metric-period` render key can never collide
// within this output. Apps with fewer than PROPERTY_CARD_STAT_COUNT synced
// metrics simply render fewer stats rather than padding with fabricated
// ones.
export function selectCardStats(metrics: CurrentMetric[]): CurrentMetric[] {
  const prioritized = STAT_PRIORITY.flatMap((entry) => {
    const match = bestMatchForEntry(metrics, entry);
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

// Only the issues stat carries a health tone — money/audience stats render
// in the card's default ink color. Matches the original design
// (PropertyCard.vue's pre-view-model-seam history): `AppStat.tone` was only
// ever set on the "ISSUES" stat, never MRR/USERS.
export function metricTone(metric: CurrentMetric): HealthTone | undefined {
  if (metric.metric !== METRIC_OPEN_ISSUES) {
    return undefined;
  }
  return metric.value > 0 ? "danger" : "ok";
}

// The sparkline beside the stats row draws whichever of the card's own
// curated stats has history, in the same priority order they're rendered
// in — so the trend line is always FOR one of the numbers actually shown
// next to it, never an unrelated metric plucked from wherever
// AppCard.sparklines happens to start. Returns null (hides the sparkline
// entirely) when none of the visible stats have series data yet, rather
// than fabricating a trend for a metric that isn't even on the card.
export function selectSparklineSeries(
  sparklines: MetricSeries[],
  visibleMetrics: CurrentMetric[],
): MetricSeries | null {
  for (const metric of visibleMetrics) {
    const series = sparklines.find(
      (candidate) =>
        candidate.metric === metric.metric &&
        candidate.period === metric.period,
    );
    if (series) {
      return series;
    }
  }
  return null;
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
