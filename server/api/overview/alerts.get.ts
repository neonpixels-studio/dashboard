import { useDb } from "../../db";
import { reposForProperty } from "../../integrations/github/repos";
import { readGithubToken } from "../../integrations/github/token";
import { listSyncHealthRows } from "../../integrations/persist";
import { requireUser } from "../../utils/auth";
import {
  fetchFailingGithubRepos,
  type DrizzleDb,
} from "../../utils/dashboardQueries";
import { buildGithubCiAlerts } from "../../utils/githubAlerts";
import {
  buildSyncAlerts,
  sortAlertsNewestFirst,
} from "../../utils/overviewAlerts";
import type { OverviewAlertsResponse } from "../../../shared/types/alerts";

// Without a token the sync skips and leaves its last rows behind, so a stale
// failing row must not keep alerting once GitHub is no longer configured.
async function failingGithubRepos(db: DrizzleDb) {
  if (!readGithubToken()) {
    return [];
  }
  const failingRepos = await fetchFailingGithubRepos(db);
  return failingRepos.filter((row) =>
    reposForProperty(row.slug).includes(row.repo),
  );
}

// Active problems for the "/" overview Alerts panel, DB-backed only:
// sync_status plus failing GitHub CI on main. Later sources (deploys) add
// their alerts here.
export default defineEventHandler(
  async (event): Promise<OverviewAlertsResponse> => {
    requireUser(event);

    const db = useDb();
    const [syncRows, failingRepos] = await Promise.all([
      listSyncHealthRows(db),
      failingGithubRepos(db),
    ]);
    return sortAlertsNewestFirst([
      ...buildSyncAlerts(syncRows, new Date()),
      ...buildGithubCiAlerts(failingRepos),
    ]);
  },
);
