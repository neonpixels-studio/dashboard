import type { OverviewAlert } from "../../shared/types/alerts";
import { checksUrl } from "../integrations/github/links";
import { GITHUB_VENDOR } from "../integrations/github/repos";
import type { GithubRepoStatusRow } from "./dashboardQueries";

// One alert per repo whose main is failing, so a red markpost-cli alerts on
// markpost while naming markpost-cli. Only "failing" is passed in; pending and
// green repos never alert, and a repo that goes green simply stops appearing.
export function buildGithubCiAlerts(
  failingRepos: GithubRepoStatusRow[],
): OverviewAlert[] {
  return failingRepos.map((row) => ({
    id: `ci-failing:${row.slug}:${row.repo}`,
    slug: row.slug,
    source: GITHUB_VENDOR,
    message: `CI failing on main (${row.repo})`,
    occurredAt: row.commitAt.toISOString(),
    href: checksUrl(row.repo, row.ciSha),
  }));
}
