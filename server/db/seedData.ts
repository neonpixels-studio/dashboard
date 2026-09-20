import type { AppTemplate, DashboardApp } from "../../app/config/apps";
import type { integrationVendor } from "./schema";

type IntegrationVendor = (typeof integrationVendor.enumValues)[number];

const GA4_VENDOR: IntegrationVendor = "ga4";

// Exhaustive over `AppTemplate` so a new template value fails to compile here
// instead of silently falling through to "no vendors".
const VENDORS_BY_TEMPLATE: Record<AppTemplate, IntegrationVendor[]> = {
  product: ["stripe", "clerk", "sentry"],
  writing: ["medium", "hashnode", "devto"],
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
 * additionally get Stripe/Clerk/Sentry and the writing app gets its
 * cross-posting targets — today that grouping matches each app's
 * `integrations` list exactly, but it's derived from `template`, not read
 * from `integrations` directly, so editing one app's integrations pills
 * won't automatically update its seeded vendor set. A vendor pill with no
 * matching `integrationVendor` value (e.g. danholloran's "ZYVOP") is
 * intentionally left out rather than inventing a vendor.
 *
 * Every row seeds `enabled: false` — no row has a `secretRef` or
 * `externalId` yet, so nothing here is actually wired up to poll. Enabling
 * an integration is a deliberate follow-up step once its credentials are
 * provisioned, not something this seed should fabricate.
 */
export function buildIntegrationConfigSeed(
  apps: DashboardApp[],
): IntegrationConfigSeedRow[] {
  return apps.flatMap((app) => {
    const vendors = [GA4_VENDOR, ...VENDORS_BY_TEMPLATE[app.template]];
    return vendors.map((vendor) => ({
      slug: app.slug,
      vendor,
      enabled: false,
    }));
  });
}
