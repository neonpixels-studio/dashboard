import { getRouterParam } from "h3";
import { findAppBySlug } from "../../../app/config/apps";
import { useDb } from "../../db";
import { integrationEnvironments } from "../../integrations/credentialEnvironment";
import { requireUser } from "../../utils/auth";
import {
  fetchIntegrationConfigs,
  fetchLatestMetricSnapshots,
  fetchLatestTrafficBreakdowns,
  fetchMetricSnapshotSeries,
  fetchSyncStatuses,
  fetchSyndicationPosts,
} from "../../utils/dashboardQueries";
import {
  alertsForApp,
  computeAppStatus,
  integrationHealthForApp,
  latestMetricsBySlug,
  latestSyncedAt,
  metricSeriesBySlug,
  syncSourcesForApp,
  syndicationMatrixForApp,
  trafficChannelSplitForApp,
} from "../../utils/dashboardShaping";
import type { AppDetailResponse } from "../../../shared/types/dashboard";

// Detail data for one app's product/writing/marketing template, DB-backed
// only. App identity (name, accent, template, ...) comes from
// app/config/apps.ts, joined by the frontend via `slug` — this endpoint only
// returns the DB-sourced numbers.
export default defineEventHandler(async (event): Promise<AppDetailResponse> => {
  requireUser(event);

  const slug = getRouterParam(event, "slug");
  if (!slug || !findAppBySlug(slug)) {
    throw createError({
      statusCode: 404,
      statusMessage: "Property not found",
    });
  }

  const db = useDb();

  const [
    latestMetricRows,
    seriesMetricRows,
    breakdownRows,
    syncRows,
    configRows,
    posts,
  ] = await Promise.all([
    fetchLatestMetricSnapshots(db, [slug]),
    fetchMetricSnapshotSeries(db, [slug]),
    fetchLatestTrafficBreakdowns(db, [slug]),
    fetchSyncStatuses(db, [slug]),
    fetchIntegrationConfigs(db, [slug]),
    fetchSyndicationPosts(db, slug),
  ]);

  const environments = integrationEnvironments(configRows);

  return {
    slug,
    status: computeAppStatus(syncRows, configRows, slug, latestMetricRows),
    metrics: latestMetricsBySlug(latestMetricRows, slug),
    series: metricSeriesBySlug(seriesMetricRows, slug, latestMetricRows),
    trafficBreakdown: trafficChannelSplitForApp(breakdownRows, slug),
    syndication: syndicationMatrixForApp(posts),
    alerts: alertsForApp(syncRows, configRows, slug),
    sources: syncSourcesForApp(syncRows, slug, environments),
    integrations: integrationHealthForApp(
      syncRows,
      configRows,
      slug,
      environments,
    ),
    lastSyncedAt: latestSyncedAt(syncRows),
  };
});
