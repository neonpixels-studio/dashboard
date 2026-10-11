import type {
  GithubCiState,
  GithubDetail,
  GithubItem,
  GithubRepoSummary,
} from "../../../shared/types/dashboard";
import type {
  GithubItemRow,
  GithubRepoStatusRow,
} from "../../utils/dashboardQueries";
import { checksUrl, openIssuesUrl, openPullsUrl, repoUrl } from "./links";
import { reposForProperty } from "./repos";

function toRepoSummary(
  repo: string,
  status: GithubRepoStatusRow | undefined,
): GithubRepoSummary {
  return {
    repo,
    synced: status !== undefined,
    openIssues: status?.openIssues ?? null,
    openPrs: status?.openPrs ?? null,
    ciState: (status?.ciState as GithubCiState | undefined) ?? null,
    ciUrl: checksUrl(repo, status?.ciSha ?? null),
    repoUrl: repoUrl(repo),
  };
}

function toItem(row: GithubItemRow): GithubItem {
  return {
    repo: row.repo,
    number: row.number,
    kind: row.kind === "pr" ? "pr" : "issue",
    title: row.title,
    url: row.url,
    labels: row.labels,
    updatedAt: row.itemUpdatedAt.toISOString(),
  };
}

// Repos come from the property mapping, not the stored rows, so a repo that
// hasn't synced yet still shows (as not synced) rather than vanishing.
export function buildGithubDetail(
  slug: string,
  statusRows: GithubRepoStatusRow[],
  itemRows: GithubItemRow[],
  configured: boolean,
): GithubDetail {
  const repos = reposForProperty(slug);
  const statusByRepo = new Map(statusRows.map((row) => [row.repo, row]));
  return {
    configured,
    repos: repos.map((repo) => toRepoSummary(repo, statusByRepo.get(repo))),
    issuesUrl: openIssuesUrl(repos),
    pullsUrl: openPullsUrl(repos),
    // Rows of a repo since dropped from the mapping are never replaced again.
    items: itemRows.filter((row) => repos.includes(row.repo)).map(toItem),
  };
}
