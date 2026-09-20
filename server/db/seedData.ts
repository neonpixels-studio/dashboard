import type { DashboardApp } from "../../app/config/apps";
import type { integrationVendor } from "./schema";

type IntegrationVendor = (typeof integrationVendor.enumValues)[number];

const GA4_VENDOR: IntegrationVendor = "ga4";
const PRODUCT_APP_VENDORS: IntegrationVendor[] = ["stripe", "clerk", "sentry"];
const WRITING_APP_VENDORS: IntegrationVendor[] = [
  "medium",
  "hashnode",
  "devto",
];

export interface IntegrationConfigSeedRow {
  slug: string;
  vendor: IntegrationVendor;
  enabled: boolean;
}

function vendorsForTemplate(
  template: DashboardApp["template"],
): IntegrationVendor[] {
  if (template === "product") {
    return PRODUCT_APP_VENDORS;
  }
  if (template === "writing") {
    return WRITING_APP_VENDORS;
  }
  return [];
}

/**
 * Derives the `integration_config` seed rows from `app/config/apps.ts`
 * rather than hand-listing apps here, so the seed never drifts from the
 * console's actual property list.
 *
 * Every app gets a GA4 row (every property shows a "GA" pill). Product apps
 * additionally get Stripe/Clerk/Sentry and the writing app gets its
 * cross-posting targets, mirroring each app's `integrations` list. A vendor
 * pill with no matching `integrationVendor` value (e.g. danholloran's
 * "ZYVOP") is intentionally left out rather than inventing a vendor or
 * fabricating credentials — `enabled: true` only marks that the integration
 * is real per apps.ts, never that a secret has been provisioned.
 */
export function buildIntegrationConfigSeed(
  apps: DashboardApp[],
): IntegrationConfigSeedRow[] {
  return apps.flatMap((app) => {
    const vendors = [GA4_VENDOR, ...vendorsForTemplate(app.template)];
    return vendors.map((vendor) => ({
      slug: app.slug,
      vendor,
      enabled: true,
    }));
  });
}
