import {
  METRIC_SESSIONS,
  PERIOD_30D,
  PERIOD_DAILY,
} from "../../utils/dashboardMetrics";
import type {
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../types";
import { createGa4ReportRunner } from "./ga4Client";
import {
  sumReportSessions,
  toChannelBreakdown,
  toDailySessionPoints,
} from "./mapping";
import type { RunGa4Report } from "./types";

const GA4_VENDOR = "ga4";
// GA4's own relative-date syntax, resolved server-side — one shared,
// complete-days-only 30-day window ("30daysAgo".."yesterday") for every
// report this provider runs, so the 30d total and the channel split (which
// share one denominator — see sumReportSessions) are always scoped to the
// same days as the daily series sitting in the same sparkline. This does
// NOT guarantee the daily series sums to exactly the stored 30d total: the
// total is deliberately taken from the channel report, not summed from the
// date report, because the date dimension can double-count a
// midnight-spanning session (see sumReportSessions's comment) — the two
// numbers are independently-scoped and normally close, not identical by
// construction. Using "today" for any one of these reports (a live,
// still-accumulating day) would additionally make that gap change every
// time this runs later in the day, which is why all three stick to
// complete days only.
const REPORT_START_DATE = "30daysAgo";
const REPORT_END_DATE = "yesterday";
const DATE_DIMENSION_NAME = "date";
// GA4 has since renamed this dimension's UI label to "Session default
// channel group" and added a newer `sessionDefaultChannelGroup` alias, but
// `sessionDefaultChannelGrouping` remains the long-standing, documented API
// dimension name — confirm against a live property (this environment has no
// network access to verify) before assuming it needs to change.
const CHANNEL_DIMENSION_NAME = "sessionDefaultChannelGrouping";
const NO_SESSIONS = 0;

/**
 * Per the issue's config model, a property's GA4 property id can live in
 * either of two places: `integration_config.external_id` (a per-row,
 * DB-driven value) or the shared studio env var `NUXT_GA4_PROPERTY_ID_<SLUG>`
 * (the deploy-time default — see .env.example, and nuxt.config.ts's
 * runtimeConfig for why each app's var is declared there even though it's
 * read here via `process.env` directly, not `useRuntimeConfig()`). The DB row
 * wins when set, mirroring server/integrations/stripe/provider.ts's
 * resolveProductIdsSource and config.ts's own row-overrides-shared-default
 * precedent.
 */
function resolvePropertyId(config: IntegrationConfig): string | null {
  const externalId = config.externalId?.trim();
  if (externalId) {
    return externalId;
  }
  const envVarName = `NUXT_GA4_PROPERTY_ID_${config.slug.toUpperCase()}`;
  // Trimmed the same way as externalId above — .env.example ships every
  // NUXT_GA4_PROPERTY_ID_* var present-but-empty by default, and an untrimmed
  // whitespace value would be truthy and reach GA4 as "properties/   "
  // instead of hitting the unconfigured-app branch.
  const fromEnv = process.env[envVarName]?.trim();
  return fromEnv || null;
}

/**
 * Core fetch logic, decoupled from the real GA4 client so it can be unit
 * tested against a fixture-backed `RunGa4Report` with no network call —
 * `ga4Provider.fetch` below is the only caller that wires in the real one
 * (ga4Client.ts).
 *
 * Applies to all six properties (per the issue) once each has an enabled
 * `integration_config` row; a property with no property id configured
 * anywhere yet simply never reaches here (the orchestrator only calls
 * providers for enabled config rows), and the empty-propertyId branch below
 * is this function's own defense-in-depth copy of that "unconfigured -> no
 * rows, never zeros" guarantee (mirroring fetchStripeMetrics).
 */
export async function fetchGa4Metrics(
  config: IntegrationConfig,
  runGa4Report: RunGa4Report,
): Promise<ProviderResult> {
  const propertyId = resolvePropertyId(config);
  if (!propertyId) {
    return { metrics: [], trafficBreakdown: [], syndicationPosts: [] };
  }

  const [dailyRows, channelRows] = await Promise.all([
    runGa4Report({
      propertyId,
      dimension: DATE_DIMENSION_NAME,
      startDate: REPORT_START_DATE,
      endDate: REPORT_END_DATE,
    }),
    runGa4Report({
      propertyId,
      dimension: CHANNEL_DIMENSION_NAME,
      startDate: REPORT_START_DATE,
      endDate: REPORT_END_DATE,
    }),
  ]);

  // GA4 can withhold rows from one dimensioned report (e.g. data
  // thresholding) without withholding them from another over the same
  // window — if the channel report came back empty while the date report
  // didn't, deriving totalSessions from channelRows below would silently
  // store a 0 (or understated) sessions total for a property GA4 says had
  // real traffic, rather than surfacing the mismatch. A missing metric
  // isn't a real zero (server/utils/dashboardShaping.ts's own precedent).
  if (!channelRows.length && dailyRows.length) {
    throw new Error(
      `GA4 channel report for "${config.slug}" returned no rows while the ` +
        `date report returned ${dailyRows.length} — refusing to report a ` +
        "sessions total of 0.",
    );
  }

  const dailySessionPoints = toDailySessionPoints(dailyRows);
  // Derived from channelRows, not summed from the daily series — see
  // sumReportSessions's comment for why the date-dimensioned report can
  // double-count a midnight-spanning session and shouldn't be the source of
  // the stored total (or of toChannelBreakdown's denominator below).
  const totalSessions = sumReportSessions(channelRows);
  const capturedAt = new Date();

  // Backfills up to 30 PERIOD_DAILY rows every sync (not just today's), so a
  // sparkline has data immediately rather than depending on 30+ days of
  // polls to accumulate one point at a time. Each row's `capturedAt` is that
  // calendar day (not the sync time), which means a re-sync re-reports the
  // same days with the same `capturedAt` — this provider returns them as
  // plain data (per the IntegrationProvider contract, no DB writes happen
  // here); whichever orchestrator eventually persists ProviderResult must
  // upsert metric_snapshot on (slug, vendor, metric, period, capturedAt)
  // rather than blind-inserting, or repeated syncs will duplicate every day
  // in this backfill.
  const metrics: ProviderResult["metrics"] = [
    {
      vendor: GA4_VENDOR,
      metric: METRIC_SESSIONS,
      value: totalSessions,
      period: PERIOD_30D,
      capturedAt,
    },
    ...dailySessionPoints.map((point) => ({
      vendor: GA4_VENDOR,
      metric: METRIC_SESSIONS,
      value: point.sessions,
      period: PERIOD_DAILY,
      capturedAt: point.date,
    })),
  ];

  // A percentage split of zero sessions is undefined, not "every channel at
  // 0%" — see toChannelBreakdown's comment.
  const trafficBreakdown =
    totalSessions > NO_SESSIONS
      ? toChannelBreakdown(channelRows, totalSessions).map((breakdown) => ({
          ...breakdown,
          capturedAt,
        }))
      : [];

  return { metrics, trafficBreakdown, syndicationPosts: [] };
}

export const ga4Provider: IntegrationProvider = {
  vendor: GA4_VENDOR,
  async fetch(config: IntegrationConfig): Promise<ProviderResult> {
    if (!config.secret) {
      throw new Error(
        `GA4 provider for "${config.slug}" has no service account private key configured.`,
      );
    }
    // Not secret (a public identifier, not a credential) — read directly via
    // process.env like Stripe's resolveProductIdsSource, rather than through
    // config.secret's secretRef machinery, which is reserved for the one
    // actual credential (the private key).
    const clientEmail = process.env.NUXT_GA4_SA_CLIENT_EMAIL;
    if (!clientEmail) {
      throw new Error(
        `GA4 provider for "${config.slug}" has no NUXT_GA4_SA_CLIENT_EMAIL configured.`,
      );
    }

    const runGa4Report = createGa4ReportRunner({
      clientEmail,
      privateKey: config.secret,
    });
    return fetchGa4Metrics(config, runGa4Report);
  },
};
