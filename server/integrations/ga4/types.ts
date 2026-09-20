// Plain, JSON-serializable subset of the GA4 Data API's report shape this
// provider needs. Deliberately NOT the `@google-analytics/data` package's own
// `protos.google.analytics.data.v1beta.IRunReportResponse` (every dimension/
// metric value is a nullable, possibly-nested proto field) — ga4Client.ts is
// the one place that translates a real API response into this narrower,
// unambiguous shape; mapping.ts and provider.ts (and their tests) only ever
// see this file's types, and test fixtures are recorded directly in this
// shape. Mirrors server/integrations/stripe/types.ts's StripeSubscription
// split.

// One (dimension, metric) pair from a GA4 report row, e.g. dimensionValue
// "20260919" / metricValue "142" for a date-dimensioned sessions report, or
// dimensionValue "Organic Search" / metricValue "800" for a channel-grouped
// one. GA4's API returns metric values as strings regardless of the metric's
// underlying numeric type — mapping.ts is where these get parsed to numbers.
export interface Ga4ReportRow {
  dimensionValue: string;
  metricValue: string;
}

export interface Ga4ReportRequest {
  propertyId: string;
  dimension: string;
  startDate: string;
  endDate: string;
}

// The seam every pure function in this package is tested against instead of
// a real GA4 client: `createGa4ReportRunner` (ga4Client.ts) builds the real
// implementation; provider unit tests substitute a fixture-backed fake with
// the same signature and never touch the network.
export type RunGa4Report = (
  request: Ga4ReportRequest,
) => Promise<Ga4ReportRow[]>;

export interface Ga4ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}
