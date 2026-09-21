import {
  METRIC_FATAL_ISSUES,
  METRIC_OPEN_ISSUES,
  PERIOD_CURRENT,
} from "../../utils/dashboardMetrics";
import type {
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../types";
import { createSentryIssueSearcher } from "./sentryClient";
import { countAllSentryIssues } from "./issueCounts";
import type { SearchSentryIssues } from "./types";

const SENTRY_VENDOR = "sentry";
// Sentry's own search query syntax — see mapping.ts's sentryStatusChip for
// why fatal is tracked as its own count rather than derived from a single
// broader query.
const UNRESOLVED_ISSUES_QUERY = "is:unresolved";
const UNRESOLVED_FATAL_ISSUES_QUERY = "is:unresolved level:fatal";

/**
 * Per the issue's config model, a property's Sentry project slug can live in
 * either of two places: `integration_config.external_id` (a per-row,
 * DB-driven value) or the shared studio env var
 * `NUXT_SENTRY_PROJECT_<SLUG>` (the deploy-time default — see .env.example,
 * and nuxt.config.ts's runtimeConfig for why each app's var is declared
 * there even though it's read here via `process.env` directly, not
 * `useRuntimeConfig()`). The DB row wins when set, mirroring
 * server/integrations/stripe/provider.ts's resolveProductIdsSource and
 * server/integrations/ga4/provider.ts's resolvePropertyId.
 */
function resolveProjectSlug(config: IntegrationConfig): string | null {
  const externalId = config.externalId?.trim();
  if (externalId) {
    return externalId;
  }
  const envVarName = `NUXT_SENTRY_PROJECT_${config.slug.toUpperCase()}`;
  const fromEnv = process.env[envVarName]?.trim();
  return fromEnv || null;
}

/**
 * Core fetch logic, decoupled from the real Sentry HTTP client so it can be
 * unit tested against a fixture-backed `SearchSentryIssues` with no network
 * call — `sentryProvider.fetch` below is the only caller that wires in the
 * real one (sentryClient.ts).
 *
 * Per the issue's scope, this provider applies only to the product-template
 * apps (basin, markpost, wanderist) — grimicorn.dev and neonpixels.dev don't
 * use Sentry and get no `integration_config` row for it at all. A property
 * with a row but no project slug configured anywhere yet simply never
 * reaches here (the orchestrator only calls providers for enabled config
 * rows), and the empty-projectSlug branch below is this function's own
 * defense-in-depth copy of that "unconfigured -> no rows, never zeros"
 * guarantee (mirroring fetchStripeMetrics/fetchGa4Metrics) — it is NOT how a
 * real Sentry API failure is handled; those propagate as thrown errors (see
 * countAllSentryIssues / sentryClient.ts), which the orchestrator turns into
 * a failed sync_status row rather than a silently-zeroed metric.
 */
export async function fetchSentryMetrics(
  config: IntegrationConfig,
  searchSentryIssues: SearchSentryIssues,
): Promise<ProviderResult> {
  const projectSlug = resolveProjectSlug(config);
  if (!projectSlug) {
    return { metrics: [], trafficBreakdown: [], syndicationPosts: [] };
  }

  const [openIssuesCount, fatalIssuesCount] = await Promise.all([
    countAllSentryIssues(
      searchSentryIssues,
      projectSlug,
      UNRESOLVED_ISSUES_QUERY,
    ),
    countAllSentryIssues(
      searchSentryIssues,
      projectSlug,
      UNRESOLVED_FATAL_ISSUES_QUERY,
    ),
  ]);
  const capturedAt = new Date();

  return {
    metrics: [
      {
        vendor: SENTRY_VENDOR,
        metric: METRIC_OPEN_ISSUES,
        value: openIssuesCount,
        period: PERIOD_CURRENT,
        capturedAt,
      },
      {
        vendor: SENTRY_VENDOR,
        metric: METRIC_FATAL_ISSUES,
        value: fatalIssuesCount,
        period: PERIOD_CURRENT,
        capturedAt,
      },
    ],
    trafficBreakdown: [],
    syndicationPosts: [],
  };
}

export const sentryProvider: IntegrationProvider = {
  vendor: SENTRY_VENDOR,
  async fetch(config: IntegrationConfig): Promise<ProviderResult> {
    if (!config.secret) {
      throw new Error(
        `Sentry provider for "${config.slug}" has no auth token configured.`,
      );
    }
    // Not secret (an org identifier, not a credential) — read directly via
    // process.env like Ga4's NUXT_GA4_SA_CLIENT_EMAIL read, rather than
    // through config.secret's secretRef machinery, which is reserved for the
    // one actual credential (the auth token).
    const orgSlug = process.env.NUXT_SENTRY_ORG;
    if (!orgSlug) {
      throw new Error(
        `Sentry provider for "${config.slug}" has no NUXT_SENTRY_ORG configured.`,
      );
    }

    const searchSentryIssues = createSentryIssueSearcher(
      config.secret,
      orgSlug,
    );
    return fetchSentryMetrics(config, searchSentryIssues);
  },
};
