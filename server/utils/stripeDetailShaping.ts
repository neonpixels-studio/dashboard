// Pure shaping of the stripe_plan_revenue / stripe_event rows into the Stripe
// panel's response (StripeDetail). No `db` here, same as dashboardShaping.ts.
import { CENTS_PER_DOLLAR } from "../integrations/stripe/mrr";
import { configuredProductIds } from "../integrations/stripe/productIds";
import type {
  IntegrationEnvironment,
  StripeDetail,
  StripeRecentEvent,
} from "../../shared/types/dashboard";
import type {
  IntegrationConfigRow,
  StripeEventRow,
  StripePlanRevenueRow,
} from "./dashboardQueries";

const STRIPE_VENDOR = "stripe";
const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com";

// Stripe object id prefix -> dashboard path segment. An id with any other
// prefix gets no link rather than a guessed one.
const OBJECT_PATH_BY_PREFIX: Record<string, string> = {
  sub_: "subscriptions",
  in_: "invoices",
};

// Test-mode keys view the same account under /test. An unknown environment
// (key without a recognizable prefix) falls back to the live dashboard.
export function stripeDashboardBase(
  environment: IntegrationEnvironment | null,
): string {
  return environment === "development"
    ? `${STRIPE_DASHBOARD_URL}/test`
    : STRIPE_DASHBOARD_URL;
}

// An app configured with one product links straight to its product page;
// several (or none) link to the product list, since the shared studio account
// has no per-app page.
export function stripeAppDashboardUrl(
  environment: IntegrationEnvironment | null,
  productIds: string[],
): string {
  const base = stripeDashboardBase(environment);
  const [onlyProductId] = productIds;
  if (productIds.length === 1 && onlyProductId) {
    return `${base}/products/${onlyProductId}`;
  }
  return `${base}/products`;
}

export function stripeObjectUrl(
  environment: IntegrationEnvironment | null,
  objectId: string,
): string | null {
  const prefix = Object.keys(OBJECT_PATH_BY_PREFIX).find((candidate) =>
    objectId.startsWith(candidate),
  );
  if (!prefix) {
    return null;
  }
  return `${stripeDashboardBase(environment)}/${OBJECT_PATH_BY_PREFIX[prefix]}/${objectId}`;
}

function toRecentEvent(
  row: StripeEventRow,
  environment: IntegrationEnvironment | null,
): StripeRecentEvent {
  return {
    id: row.eventId,
    kind: row.kind,
    occurredAt: row.occurredAt.toISOString(),
    email: row.emailMasked,
    plan: row.planName,
    amount:
      row.amountCents === null ? null : row.amountCents / CENTS_PER_DOLLAR,
    url: stripeObjectUrl(environment, row.objectId),
  };
}

function enabledStripeConfig(
  configRows: IntegrationConfigRow[],
  slug: string,
): IntegrationConfigRow | undefined {
  return configRows.find(
    (row) => row.slug === slug && row.vendor === STRIPE_VENDOR && row.enabled,
  );
}

export function stripeDetailForApp(
  planRows: StripePlanRevenueRow[],
  eventRows: StripeEventRow[],
  configRows: IntegrationConfigRow[],
  slug: string,
  environment: IntegrationEnvironment | null,
): StripeDetail | null {
  const stripeConfig = enabledStripeConfig(configRows, slug);
  if (!stripeConfig) {
    return null;
  }
  return {
    environment,
    dashboardUrl: stripeAppDashboardUrl(
      environment,
      configuredProductIds(stripeConfig),
    ),
    plans: planRows.map((row) => ({
      productId: row.productId,
      plan: row.planName,
      monthlyRevenue: row.monthlyRevenue,
      subscribers: row.subscribers,
    })),
    events: eventRows.map((row) => toRecentEvent(row, environment)),
  };
}
