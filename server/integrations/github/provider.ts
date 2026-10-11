import { NO_DEADLINE } from "../types";
import type {
  FetchDeadline,
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../types";
import { createGithubClient, type GithubClient } from "./githubClient";
import { GITHUB_VENDOR, reposForProperty } from "./repos";
import { fetchRepoSnapshot } from "./snapshot";
import { readGithubToken } from "./token";
import type { GithubRepoSnapshot } from "./types";

export function fetchGithubSnapshots(
  slug: string,
  client: GithubClient,
  syncedAt: Date,
): Promise<GithubRepoSnapshot[]> {
  return Promise.all(
    reposForProperty(slug).map((repo) =>
      fetchRepoSnapshot(client, repo, syncedAt),
    ),
  );
}

// No token is "not configured", not a failure: a skipped tick records the run
// without raising a failed-sync alert, and the page renders "not configured".
function notConfiguredResult(): ProviderResult {
  return {
    metrics: [],
    trafficBreakdown: [],
    syndicationPosts: [],
    skipped: true,
  };
}

export const githubProvider: IntegrationProvider = {
  vendor: GITHUB_VENDOR,
  async fetch(
    config: IntegrationConfig,
    deadline: FetchDeadline = NO_DEADLINE,
  ): Promise<ProviderResult> {
    const token = readGithubToken();
    if (!token) {
      return notConfiguredResult();
    }
    const client = createGithubClient({ token, deadline });
    return {
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
      github: await fetchGithubSnapshots(config.slug, client, new Date()),
    };
  },
};
