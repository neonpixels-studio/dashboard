import type { GithubClient } from "./githubClient";
import { rollupMainCi } from "./ciState";
import {
  dedupeItemsByNumber,
  pickWorkflowRuns,
  toCombinedStatus,
  toGithubItem,
  toMainCommit,
  toWorkflowRun,
} from "./mapping";
import { GITHUB_MAIN_BRANCH, GITHUB_ORG } from "./repos";
import type {
  GithubItemInput,
  GithubMainCi,
  GithubRepoSnapshot,
} from "./types";

async function fetchOpenItems(
  client: GithubClient,
  repo: string,
): Promise<GithubItemInput[]> {
  const rawItems = await client.getAllPages(
    `/repos/${GITHUB_ORG}/${repo}/issues`,
    { state: "open", sort: "updated", direction: "desc" },
  );
  return dedupeItemsByNumber(rawItems.map(toGithubItem));
}

// CI comes from workflow runs (Actions: read) rather than the Checks API,
// which fine-grained tokens cannot be granted, plus the combined commit
// status (Netlify reports there).
async function fetchMainCi(
  client: GithubClient,
  repo: string,
): Promise<GithubMainCi> {
  const repoPath = `/repos/${GITHUB_ORG}/${repo}`;
  const { sha, commitAt } = toMainCommit(
    await client.get(`${repoPath}/commits/${GITHUB_MAIN_BRANCH}`),
  );
  // Paginated: scheduled workflows pile many runs onto an idle main, which
  // would otherwise push the push-triggered run off the first page.
  const [rawRuns, rawStatus] = await Promise.all([
    client.getAllPages(
      `${repoPath}/actions/runs`,
      { head_sha: sha },
      pickWorkflowRuns,
    ),
    client.get(`${repoPath}/commits/${sha}/status`),
  ]);
  return {
    state: rollupMainCi(
      rawRuns.map(toWorkflowRun),
      toCombinedStatus(rawStatus),
    ),
    sha,
    commitAt,
  };
}

export async function fetchRepoSnapshot(
  client: GithubClient,
  repo: string,
  syncedAt: Date,
): Promise<GithubRepoSnapshot> {
  const [items, ci] = await Promise.all([
    fetchOpenItems(client, repo),
    fetchMainCi(client, repo),
  ]);
  return {
    repo,
    openIssues: items.filter((item) => item.kind === "issue").length,
    openPrs: items.filter((item) => item.kind === "pr").length,
    ci,
    items,
    syncedAt,
  };
}
