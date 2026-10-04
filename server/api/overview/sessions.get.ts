import { APPS } from "../../../app/config/apps";
import { useDb } from "../../db";
import { requireUser } from "../../utils/auth";
import {
  fetchLatestMetricSnapshots,
  fetchMetricSnapshotSeries,
} from "../../utils/dashboardQueries";
import { sessionsForApp } from "../../utils/dashboardShaping";
import type { OverviewSessionsResponse } from "../../../shared/types/overviewSessions";

// Per-property historical sessions for the "/" overview chart, DB-backed
// only (metric_snapshot rows the GA4 poller already wrote) — never a live
// GA4 call per request.
export default defineEventHandler(
  async (event): Promise<OverviewSessionsResponse> => {
    requireUser(event);

    const db = useDb();
    const slugs = APPS.map((app) => app.slug);

    const [latestRows, seriesRows] = await Promise.all([
      fetchLatestMetricSnapshots(db, slugs),
      fetchMetricSnapshotSeries(db, slugs),
    ]);

    return slugs.map((slug) => sessionsForApp(latestRows, seriesRows, slug));
  },
);
