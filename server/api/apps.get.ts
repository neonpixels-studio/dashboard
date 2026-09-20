import { APPS } from "../../app/config/apps";
import { useDb } from "../db";
import { requireUser } from "../utils/auth";
import {
  fetchIntegrationConfigs,
  fetchLatestMetricSnapshots,
  fetchMetricSnapshotSeries,
  fetchSyncStatuses,
} from "../utils/dashboardQueries";
import {
  computeAppStatus,
  integrationHealthForApp,
  latestMetricsBySlug,
  metricSeriesBySlug,
} from "../utils/dashboardShaping";
import type { AppsResponse } from "../../shared/types/dashboard";

// Per-property card data for every app, DB-backed only. Sparklines are the
// raw metric time series (replacing the old hardcoded sparklinePath
// strings) — the frontend draws the path.
export default defineEventHandler(async (event): Promise<AppsResponse> => {
  requireUser(event);

  const db = useDb();
  const slugs = APPS.map((app) => app.slug);

  const [latestMetricRows, seriesMetricRows, syncRows, configRows] =
    await Promise.all([
      fetchLatestMetricSnapshots(db, slugs),
      fetchMetricSnapshotSeries(db, slugs),
      fetchSyncStatuses(db, slugs),
      fetchIntegrationConfigs(db, slugs),
    ]);

  return slugs.map((slug) => ({
    slug,
    status: computeAppStatus(syncRows, configRows, slug),
    metrics: latestMetricsBySlug(latestMetricRows, slug),
    sparklines: metricSeriesBySlug(seriesMetricRows, slug),
    integrations: integrationHealthForApp(configRows, syncRows, slug),
  }));
});
