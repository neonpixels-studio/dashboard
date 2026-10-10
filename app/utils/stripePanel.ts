// View-model for the Stripe half of the product MONEY & HEALTH panel. Pure
// shaping over AppDetailResponse (`series` for the MRR line, `stripe` for the
// plan split and events); nothing here is a placeholder, so each section is
// simply empty when its data is.
import type {
  AppDetailResponse,
  IntegrationEnvironment,
  MetricPoint,
  StripeEventKind,
  StripeRecentEvent,
} from "#shared/types/dashboard";
import { METRIC_MRR, PERIOD_CURRENT, findSeries } from "~/utils/metricTile";
import {
  formatAxisDate,
  formatCurrency,
  formatPct,
} from "~/utils/rollupFormat";
import { buildAxisLabels, buildSparklinePath } from "~/utils/sparklinePath";

export const MRR_CHART_VIEWBOX_WIDTH = 340;
export const MRR_CHART_VIEWBOX_HEIGHT = 80;
export const MRR_WINDOW_DAYS = 30;
const MINIMUM_CHART_POINTS = 2;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const PERCENT = 100;
const MINUS_SIGN = "−";
const UNKNOWN_CUSTOMER = "Unknown customer";

const EVENT_LABELS: Record<StripeEventKind, string> = {
  new: "New",
  canceled: "Canceled",
  payment_failed: "Payment failed",
};

const DOLLAR_AMOUNT_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export interface StripePlanBar {
  key: string;
  label: string;
  value: string;
  pctLabel: string;
  pct: number;
}

export interface StripeEventRowView {
  key: string;
  date: string;
  email: string;
  plan: string;
  amount: string;
  // Payment failures render as warnings; anything other than "new" renders muted.
  failed: boolean;
  muted: boolean;
  url: string | null;
  linkLabel: string;
}

export interface StripePanelData {
  environment: IntegrationEnvironment | null;
  dashboardUrl: string | null;
  mrrPath: string;
  mrrAxisLabels: string[];
  plans: StripePlanBar[];
  events: StripeEventRowView[];
  // True when there is nothing at all to show, so the panel renders a single
  // empty state instead of three empty sections.
  isEmpty: boolean;
}

// The last MRR_WINDOW_DAYS ending at the newest synced point (not at the
// wall clock, which SSR and the client would disagree on).
export function mrrWindowPoints(
  seriesList: AppDetailResponse["series"],
): MetricPoint[] {
  const points = findSeries(seriesList, METRIC_MRR, PERIOD_CURRENT)?.points;
  const newest = points?.at(-1);
  if (!points || !newest) {
    return [];
  }
  const windowStart =
    new Date(newest.capturedAt).getTime() -
    MRR_WINDOW_DAYS * MILLISECONDS_PER_DAY;
  const windowPoints = points.filter(
    (point) => new Date(point.capturedAt).getTime() >= windowStart,
  );
  return windowPoints.length >= MINIMUM_CHART_POINTS ? windowPoints : [];
}

function planBars(detail: AppDetailResponse["stripe"]): StripePlanBar[] {
  const plans = detail?.plans ?? [];
  const total = plans.reduce((sum, plan) => sum + plan.monthlyRevenue, 0);
  if (total <= 0) {
    return [];
  }
  return plans.map((plan) => {
    const pct = (plan.monthlyRevenue / total) * PERCENT;
    return {
      key: plan.productId,
      label: plan.plan,
      value: formatCurrency(plan.monthlyRevenue),
      pctLabel: formatPct(pct),
      pct,
    };
  });
}

function eventAmount(event: StripeRecentEvent): string {
  if (event.amount === null) {
    return "—";
  }
  const formatted = DOLLAR_AMOUNT_FORMATTER.format(event.amount);
  return event.kind === "new" ? `+${formatted}` : `${MINUS_SIGN}${formatted}`;
}

function eventPlanLabel(event: StripeRecentEvent): string {
  return event.kind === "new"
    ? event.plan
    : `${EVENT_LABELS[event.kind]} · ${event.plan}`;
}

function eventRow(event: StripeRecentEvent): StripeEventRowView {
  const email = event.email ?? UNKNOWN_CUSTOMER;
  return {
    key: event.id,
    date: formatAxisDate(event.occurredAt) ?? "—",
    email,
    plan: eventPlanLabel(event),
    amount: eventAmount(event),
    failed: event.kind === "payment_failed",
    muted: event.kind !== "new",
    url: event.url,
    linkLabel: `${EVENT_LABELS[event.kind]}: ${email}, view in Stripe`,
  };
}

export function buildStripePanelData(
  detail: AppDetailResponse | null,
): StripePanelData {
  const mrrPoints = mrrWindowPoints(detail?.series ?? []);
  const plans = planBars(detail?.stripe ?? null);
  const events = (detail?.stripe?.events ?? []).map(eventRow);
  return {
    environment: detail?.stripe?.environment ?? null,
    dashboardUrl: detail?.stripe?.dashboardUrl ?? null,
    mrrPath: mrrPoints.length
      ? buildSparklinePath(
          mrrPoints,
          MRR_CHART_VIEWBOX_WIDTH,
          MRR_CHART_VIEWBOX_HEIGHT,
        )
      : "",
    mrrAxisLabels: buildAxisLabels(mrrPoints),
    plans,
    events,
    isEmpty: !mrrPoints.length && !plans.length && !events.length,
  };
}
