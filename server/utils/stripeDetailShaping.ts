// Pure shaping of the stripe_plan_revenue / stripe_event rows into the Stripe
// panel's response (StripeDetail). No `db` here, same as dashboardShaping.ts.
import { CENTS_PER_DOLLAR } from "../integrations/stripe/mrr";
import { configuredProductIds } from "../integrations/stripe/productIds";
import { readIntegrationEnv } from "../integrations/integrationEnv";
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
const STRIPE_ACCOUNT_ID_ENV_PREFIX = "NUXT_STRIPE_ACCOUNT_ID_";

// Stripe object id prefix -> dashboard path segment. An id with any other
// prefix gets no link rather than a guessed one.
const OBJECT_PATH_BY_PREFIX: Record<string, string> = {
  sub_: "subscriptions",
  in_: "invoices",
};

// Each app has its own Stripe account. Without the acct_ segment Stripe opens
// the link on whichever account the viewer last used, and the object is "not
// found" on any other account.
function stripeAccountUrl(slug: string): string {
  const accountId = readIntegrationEnv(
    `${STRIPE_ACCOUNT_ID_ENV_PREFIX}${slug.toUpperCase()}`,
  )?.trim();
  if (!accountId) {
    return STRIPE_DASHBOARD_URL;
  }
  return `${STRIPE_DASHBOARD_URL}/${accountId}`;
}

// Test-mode keys view the same account under /test. An unknown environment
// (key without a recognizable prefix) falls back to the live dashboard.
export function stripeDashboardBase(
  slug: string,
  environment: IntegrationEnvironment | null,
): string {
  const accountUrl = stripeAccountUrl(slug);
  return environment === "development" ? `${accountUrl}/test` : accountUrl;
}

// An app configured with one product links straight to its product page;
// several (or none) link to the account's product list.
export function stripeAppDashboardUrl(
  dashboardBase: string,
  productIds: string[],
): string {
  const [onlyProductId] = productIds;
  if (productIds.length === 1 && onlyProductId) {
    return `${dashboardBase}/products/${onlyProductId}`;
  }
  return `${dashboardBase}/products`;
}

export function stripeObjectUrl(
  dashboardBase: string,
  objectId: string,
): string | null {
  const prefix = Object.keys(OBJECT_PATH_BY_PREFIX).find((candidate) =>
    objectId.startsWith(candidate),
  );
  if (!prefix) {
    return null;
  }
  return `${dashboardBase}/${OBJECT_PATH_BY_PREFIX[prefix]}/${objectId}`;
}

function toRecentEvent(
  row: StripeEventRow,
  dashboardBase: string,
): StripeRecentEvent {
  return {
    id: row.eventId,
    kind: row.kind,
    occurredAt: row.occurredAt.toISOString(),
    email: row.emailMasked,
    plan: row.planName,
    amount:
      row.amountCents === null ? null : row.amountCents / CENTS_PER_DOLLAR,
    url: stripeObjectUrl(dashboardBase, row.objectId),
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
  const dashboardBase = stripeDashboardBase(slug, environment);
  return {
    environment,
    dashboardUrl: stripeAppDashboardUrl(
      dashboardBase,
      configuredProductIds(stripeConfig),
    ),
    plans: planRows.map((row) => ({
      productId: row.productId,
      plan: row.planName,
      monthlyRevenue: row.monthlyRevenue,
      subscribers: row.subscribers,
    })),
    events: eventRows.map((row) => toRecentEvent(row, dashboardBase)),
  };
}
