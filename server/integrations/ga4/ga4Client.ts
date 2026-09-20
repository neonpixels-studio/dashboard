import { BetaAnalyticsDataClient } from "@google-analytics/data";
import type {
  Ga4ReportRequest,
  Ga4ReportRow,
  Ga4ServiceAccountCredentials,
  RunGa4Report,
} from "./types";

// A hung GA4 request would otherwise block a sync indefinitely (no
// independent deadline on a Netlify function) — same reasoning as
// server/integrations/stripe/stripeClient.ts's STRIPE_REQUEST_TIMEOUT_MS.
const GA4_REQUEST_TIMEOUT_MS = 20_000;
// GA4 Data API metric name for session count — always requested together
// with whichever `dimension` the caller passes (see fetchGa4Metrics).
const SESSIONS_METRIC_NAME = "sessions";

// Only the subset of the real GA4 client this package calls — narrowing the
// parameter type (rather than the full `BetaAnalyticsDataClient` class) is
// what makes `createGa4ReportRunner` accept a lightweight test double
// instead of a real client built from real service-account credentials.
type Ga4DataClient = Pick<BetaAnalyticsDataClient, "runReport">;

// A service-account private key's newlines survive dotenvx's own env files
// as real `\n` characters (see .env.example), but any consumer reading this
// value from a plain process.env passthrough that doesn't expand escapes
// (some CI secret stores) would hand the GA4 client a key with literal
// backslash-n sequences instead of line breaks, which fails PEM parsing.
// Idempotent: a key that already has real newlines has no literal `\n`
// substring left to replace.
export function normalizeServiceAccountPrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

/**
 * Builds the real, network-touching `RunGa4Report`. `ga4Client` defaults to a
 * real GA4 Data API client instance but is injectable — this is the one
 * function in server/integrations/ga4 that would otherwise construct a live
 * client with no seam, unlike every other function in this package
 * (mapping.ts, provider.ts), which already takes a `RunGa4Report` as a
 * parameter and is tested against a fixture-backed fake.
 */
export function createGa4ReportRunner(
  credentials: Ga4ServiceAccountCredentials,
  ga4Client: Ga4DataClient = new BetaAnalyticsDataClient({
    credentials: {
      client_email: credentials.clientEmail,
      private_key: normalizeServiceAccountPrivateKey(credentials.privateKey),
    },
  }),
): RunGa4Report {
  return async ({
    propertyId,
    dimension,
    startDate,
    endDate,
  }: Ga4ReportRequest): Promise<Ga4ReportRow[]> => {
    const [response] = await ga4Client.runReport(
      {
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: dimension }],
        metrics: [{ name: SESSIONS_METRIC_NAME }],
      },
      { timeout: GA4_REQUEST_TIMEOUT_MS },
    );

    return (response.rows ?? []).map((row) => ({
      dimensionValue: row.dimensionValues?.[0]?.value ?? "",
      metricValue: row.metricValues?.[0]?.value ?? "0",
    }));
  };
}
