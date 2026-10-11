const GA4_REPORTS_BASE_URL = "https://analytics.google.com/analytics/web/#/p";
const GA4_REPORTS_PATH = "/reports/intelligenthome";
// GA4 property ids are purely numeric; the "properties/" prefix is how the
// Data API (and some copy-pasted configs) spell the same id.
const GA4_PROPERTY_PREFIX = /^properties\//;
const GA4_NUMERIC_ID = /^\d+$/;

/**
 * Builds the Google Analytics UI URL for a property's reports, or null when
 * the id is missing or isn't a valid numeric property id (so a bad config
 * never produces a broken or injectable link).
 */
export function buildGa4ReportsUrl(
  propertyId: string | null | undefined,
): string | null {
  const normalized = propertyId?.trim().replace(GA4_PROPERTY_PREFIX, "");
  if (!normalized || !GA4_NUMERIC_ID.test(normalized)) {
    return null;
  }
  return `${GA4_REPORTS_BASE_URL}${normalized}${GA4_REPORTS_PATH}`;
}
