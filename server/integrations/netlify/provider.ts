import { findAppBySlug } from "../../../app/config/apps";
import { netlifyProjectName } from "../../../app/utils/netlify";
import { NO_DEADLINE } from "../types";
import type {
  FetchDeadline,
  IntegrationConfig,
  IntegrationProvider,
  ProviderResult,
} from "../types";
import { createNetlifyDeployFetcher } from "./netlifyClient";
import { readNetlifyToken } from "./token";
import type { FetchLatestProductionDeploy } from "./types";

const NETLIFY_VENDOR = "netlify";

const EMPTY_RESULT: ProviderResult = {
  metrics: [],
  trafficBreakdown: [],
  syndicationPosts: [],
};

function resolveProjectName(slug: string): string {
  const app = findAppBySlug(slug);
  if (!app) {
    throw new Error(
      `Netlify provider has no property configured for "${slug}".`,
    );
  }
  return netlifyProjectName(app.url);
}

/**
 * Core fetch logic, decoupled from the real HTTP client so it is unit tested
 * against a fake `FetchLatestProductionDeploy`. A project with no production
 * deploy yet yields no rows (never a fabricated one); real API failures
 * propagate as thrown errors, which the orchestrator records as a failed
 * sync_status row.
 */
export async function fetchNetlifyDeploys(
  config: IntegrationConfig,
  fetchLatestProductionDeploy: FetchLatestProductionDeploy,
): Promise<ProviderResult> {
  const deploy = await fetchLatestProductionDeploy(
    resolveProjectName(config.slug),
  );
  if (!deploy) {
    return { ...EMPTY_RESULT };
  }
  return {
    ...EMPTY_RESULT,
    deploys: [
      {
        deployId: deploy.id,
        state: deploy.state,
        finishedAt: deploy.finishedAt,
      },
    ],
  };
}

export const netlifyProvider: IntegrationProvider = {
  vendor: NETLIFY_VENDOR,
  async fetch(
    config: IntegrationConfig,
    deadline: FetchDeadline = NO_DEADLINE,
  ): Promise<ProviderResult> {
    // Env token only, never config.secret: the detail API decides "not
    // configured" from this same readNetlifyToken(), so the two can't disagree.
    const token = readNetlifyToken();
    // No token yet is a normal, expected state (the detail page shows "not
    // configured"), so skip rather than fail: a skipped run is recorded
    // without raising a sync-failed alert.
    if (!token) {
      return { ...EMPTY_RESULT, skipped: true };
    }
    return fetchNetlifyDeploys(
      config,
      createNetlifyDeployFetcher(token, undefined, deadline),
    );
  },
};
