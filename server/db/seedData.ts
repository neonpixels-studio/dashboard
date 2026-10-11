import type {
  AppTemplate,
  DashboardApp,
  InternalApp,
} from "../../app/config/apps";
import type { integrationVendor } from "./schema";

type IntegrationVendor = (typeof integrationVendor.enumValues)[number];

const GA4_VENDOR: IntegrationVendor = "ga4";
const SENTRY_VENDOR: IntegrationVendor = "sentry";
const NEON_VENDOR: IntegrationVendor = "neon";

// Exhaustive over `AppTemplate` so a new template value fails to compile here
// instead of silently falling through to "no vendors".
const VENDORS_BY_TEMPLATE: Record<AppTemplate, IntegrationVendor[]> = {
  product: ["stripe", "clerk", "sentry", "neon"],
  writing: ["medium", "hashnode", "devto", "zyvop"],
  marketing: [],
};

export interface IntegrationConfigSeedRow {
  slug: string;
  vendor: IntegrationVendor;
  enabled: boolean;
}

/**
 * Derives the `integration_config` seed rows from `app/config/apps.ts`
 * rather than hand-listing apps here, so the seed never drifts from the
 * console's actual property list.
 *
 * Every app gets a GA4 row (every property shows a "GA" pill). Product apps
 * additionally get Stripe/Clerk/Sentry/Neon and the writing app gets its
 * cross-posting targets. Internal apps (app/config/apps.ts's INTERNAL_APPS)
 * report their own Sentry issues and Neon usage, so they get a Sentry and a Neon row. This
 * grouping is derived from `template`, not from
 * live integration health — `AppCard.integrations`/`IntegrationHealth`
 * (`shared/types/dashboard.ts`) reflect what's actually configured and
 * synced, and are computed separately in `server/utils/dashboardShaping.ts`.
 *
 * Every row seeds `enabled: false` — no row has a `secretRef` or
 * `externalId` yet, so nothing here is actually wired up to poll. Enabling
 * an integration is a deliberate follow-up step once its credentials are
 * provisioned, not something this seed should fabricate.
 */
export function buildIntegrationConfigSeed(
  apps: DashboardApp[],
  internalApps: InternalApp[] = [],
): IntegrationConfigSeedRow[] {
  const propertyRows = apps.flatMap((app) => {
    const vendors = [GA4_VENDOR, ...VENDORS_BY_TEMPLATE[app.template]];
    return vendors.map((vendor) => ({
      slug: app.slug,
      vendor,
      enabled: false,
    }));
  });
  const internalRows = internalApps.flatMap((app) =>
    [SENTRY_VENDOR, NEON_VENDOR].map((vendor) => ({
      slug: app.slug,
      vendor,
      enabled: false,
    })),
  );
  return [...propertyRows, ...internalRows];
}
