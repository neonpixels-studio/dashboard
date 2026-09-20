import { createHash } from "node:crypto";
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

// The credentials are studio-wide (one service account for all six
// properties — see .env.example), so every `createGa4ReportRunner` call
// within the same warm function instance can share one gRPC client instead
// of opening a new channel + re-authenticating per property per sync. Keyed
// on both credential fields (a hash of the private key, not the raw key
// itself, since this key stays in memory only) rather than clientEmail
// alone — a rotated private key for the same service account email would
// otherwise keep being served the client built from the old, since-revoked
// key until the function instance recycles.
const sharedGa4ClientsByCredentialHash = new Map<string, Ga4DataClient>();

function credentialCacheKey(credentials: Ga4ServiceAccountCredentials): string {
  const normalizedPrivateKey = normalizeServiceAccountPrivateKey(
    credentials.privateKey,
  );
  const privateKeyHash = createHash("sha256")
    .update(normalizedPrivateKey)
    .digest("hex");
  return `${credentials.clientEmail}::${privateKeyHash}`;
}

function getSharedGa4Client(
  credentials: Ga4ServiceAccountCredentials,
): Ga4DataClient {
  const cacheKey = credentialCacheKey(credentials);
  const existingClient = sharedGa4ClientsByCredentialHash.get(cacheKey);
  if (existingClient) {
    return existingClient;
  }

  const client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: credentials.clientEmail,
      private_key: normalizeServiceAccountPrivateKey(credentials.privateKey),
    },
  });
  sharedGa4ClientsByCredentialHash.set(cacheKey, client);
  return client;
}

function assertMetricValue(row: {
  metricValues?: { value?: string | null }[] | null;
}): string {
  const metricValue = row.metricValues?.[0]?.value;
  if (metricValue === undefined || metricValue === null) {
    throw new Error(
      `GA4 report row is missing a "${SESSIONS_METRIC_NAME}" metric value.`,
    );
  }
  return metricValue;
}

/**
 * Builds the real, network-touching `RunGa4Report`. `ga4Client` defaults to
 * the shared real GA4 Data API client (see getSharedGa4Client above) but is
 * injectable — this is the one function in server/integrations/ga4 that
 * would otherwise construct a live client with no seam, unlike every other
 * function in this package (mapping.ts, provider.ts), which already takes a
 * `RunGa4Report` as a parameter and is tested against a fixture-backed fake.
 */
export function createGa4ReportRunner(
  credentials: Ga4ServiceAccountCredentials,
  ga4Client: Ga4DataClient = getSharedGa4Client(credentials),
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

    // A missing dimensionValue is tolerated as "" (it only ever becomes a
    // Map key — toChannelBucket's ?? CHANNEL_BUCKET_OTHER or
    // parseGa4Date's format check already fail loud downstream on an empty
    // one). A missing metricValue is not: it feeds straight into sessions
    // arithmetic, so silently defaulting it to "0" would understate
    // totalSessions (and, in turn, every traffic_breakdown pct) with no
    // error — see assertMetricValue.
    return (response.rows ?? []).map((row) => ({
      dimensionValue: row.dimensionValues?.[0]?.value ?? "",
      metricValue: assertMetricValue(row),
    }));
  };
}
