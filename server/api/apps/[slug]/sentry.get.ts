import { getRouterParam } from "h3";
import { findAppBySlug } from "../../../../app/config/apps";
import { useDb } from "../../../db";
import { resolveIntegrationConfig } from "../../../integrations/config";
import { readIntegrationEnv } from "../../../integrations/integrationEnv";
import { createSentryTopIssuesFetcher } from "../../../integrations/sentry/sentryClient";
import { SENTRY_VENDOR } from "../../../integrations/sentry/provider";
import { fetchSentryPanelData } from "../../../integrations/sentry/panelData";
import { requireUser } from "../../../utils/auth";
import { fetchIntegrationConfigs } from "../../../utils/dashboardQueries";
import type { SentryPanelResponse } from "../../../../shared/types/dashboard";

function notConfigured() {
  return createError({
    statusCode: 404,
    statusMessage: "Sentry is not configured for this property",
  });
}

// Live issues for the Sentry panel on a product detail page. Unlike the rest
// of the dashboard this reads Sentry directly rather than a synced table:
// the sync only stores counts, and issue rows go stale in minutes.
export default defineEventHandler(
  async (event): Promise<SentryPanelResponse> => {
    requireUser(event);

    const slug = getRouterParam(event, "slug");
    if (!slug || !findAppBySlug(slug)) {
      throw createError({
        statusCode: 404,
        statusMessage: "Property not found",
      });
    }

    const rows = await fetchIntegrationConfigs(useDb(), [slug]);
    const row = rows.find(
      (candidate) => candidate.vendor === SENTRY_VENDOR && candidate.enabled,
    );
    const orgSlug = readIntegrationEnv("NUXT_SENTRY_ORG");
    if (!row || !orgSlug) {
      throw notConfigured();
    }

    const config = resolveIntegrationConfig(row);
    if (!config.secret) {
      throw notConfigured();
    }

    const panel = await fetchSentryPanelData(
      config,
      orgSlug,
      createSentryTopIssuesFetcher(config.secret, orgSlug),
    );
    if (!panel) {
      throw notConfigured();
    }
    return panel;
  },
);
