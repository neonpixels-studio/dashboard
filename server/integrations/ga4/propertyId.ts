import type { IntegrationConfigRow } from "../types";
import { resolvePropertyId } from "./provider";

const GA4_VENDOR = "ga4";

/**
 * The GA4 property id the dashboard should link to for one app, or null when
 * GA4 isn't enabled for it. Only an enabled ga4 row counts (the orchestrator
 * never syncs a disabled one), and resolution reuses the provider's own
 * row-then-env precedence so the link always points at the property the data
 * actually came from. The secret is deliberately never copied across.
 */
export function ga4PropertyIdForApp(
  configRows: IntegrationConfigRow[],
  slug: string,
): string | null {
  const row = configRows.find(
    (candidate) =>
      candidate.slug === slug &&
      candidate.vendor === GA4_VENDOR &&
      candidate.enabled,
  );
  if (!row) {
    return null;
  }
  return resolvePropertyId({
    slug,
    vendor: row.vendor,
    externalId: row.externalId,
    secret: null,
  });
}
