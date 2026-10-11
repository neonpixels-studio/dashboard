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

// Builds a full dashboard URL from a path like "/products/prod_1".
type StripeDashboardLink = (path: string) => string;

function stripeAccountId(slug: string): string | undefined {
  const accountId = readIntegrationEnv(
    `${STRIPE_ACCOUNT_ID_ENV_PREFIX}${slug.toUpperCase()}`,
  )?.trim();
  return accountId || undefined;
}

// Each app has its own Stripe account. A plain dashboard path opens on
// whichever account the viewer last used ("not found" on any other), and so
// does /<acct_id>/<path>. Stripe's /b/<acct_id>?destination=<path> switches
// to the account first. Test-mode keys view the account under /test; an
// unknown environment (key without a recognizable prefix) falls back to live.
export function stripeDashboardLink(
  slug: string,
  environment: IntegrationEnvironment | null,
): StripeDashboardLink {
  const modePrefix = environment === "development" ? "/test" : "";
  const accountId = stripeAccountId(slug);
  return (path) => {
    const destination = `${modePrefix}${path}`;
    if (!accountId) {
      return `${STRIPE_DASHBOARD_URL}${destination}`;
    }
    return `${STRIPE_DASHBOARD_URL}/b/${accountId}?destination=${encodeURIComponent(destination)}`;
  };
}

// An app configured with one product links straight to its product page;
// several (or none) link to the account's product list.
export function stripeAppDashboardUrl(
  dashboardLink: StripeDashboardLink,
  productIds: string[],
): string {
  const [onlyProductId] = productIds;
  if (productIds.length === 1 && onlyProductId) {
    return dashboardLink(`/products/${onlyProductId}`);
  }
  return dashboardLink("/products");
}

export function stripeObjectUrl(
  dashboardLink: StripeDashboardLink,
  objectId: string,
): string | null {
  const prefix = Object.keys(OBJECT_PATH_BY_PREFIX).find((candidate) =>
    objectId.startsWith(candidate),
  );
  if (!prefix) {
    return null;
  }
  return dashboardLink(`/${OBJECT_PATH_BY_PREFIX[prefix]}/${objectId}`);
}

function toRecentEvent(
  row: StripeEventRow,
  dashboardLink: StripeDashboardLink,
): StripeRecentEvent {
  return {
    id: row.eventId,
    kind: row.kind,
    occurredAt: row.occurredAt.toISOString(),
    email: row.emailMasked,
    plan: row.planName,
    amount:
      row.amountCents === null ? null : row.amountCents / CENTS_PER_DOLLAR,
    url: stripeObjectUrl(dashboardLink, row.objectId),
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
  const dashboardLink = stripeDashboardLink(slug, environment);
  return {
    environment,
    dashboardUrl: stripeAppDashboardUrl(
      dashboardLink,
      configuredProductIds(stripeConfig),
    ),
    plans: planRows.map((row) => ({
      productId: row.productId,
      plan: row.planName,
      monthlyRevenue: row.monthlyRevenue,
      subscribers: row.subscribers,
    })),
    events: eventRows.map((row) => toRecentEvent(row, dashboardLink)),
  };
}
