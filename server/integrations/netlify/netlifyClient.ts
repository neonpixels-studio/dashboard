import { NO_DEADLINE, type FetchDeadline } from "../types";
import { toNetlifyDeploy } from "./mapping";
import type { FetchLatestProductionDeploy, NetlifyDeploy } from "./types";

const NETLIFY_API_BASE_URL = "https://api.netlify.com/api/v1";
// A hung request would otherwise block the whole sync (same reasoning as
// sentryClient.ts's SENTRY_REQUEST_TIMEOUT_MS).
const NETLIFY_REQUEST_TIMEOUT_MS = 20_000;
// Every Netlify project is reachable at <project-name>.netlify.app, and the
// API accepts that hostname anywhere it takes a site id, so no site id is
// ever hardcoded or looked up separately.
const NETLIFY_APP_DOMAIN_SUFFIX = ".netlify.app";

type FetchImpl = typeof fetch;

function buildLatestDeployUrl(projectName: string): URL {
  // Encoded: the name is derived from app config today, but this keeps a stray
  // "/" or "?" from redirecting the request to a different path.
  const siteId = encodeURIComponent(
    `${projectName}${NETLIFY_APP_DOMAIN_SUFFIX}`,
  );
  const url = new URL(`${NETLIFY_API_BASE_URL}/sites/${siteId}/deploys`);
  url.searchParams.set("production", "true");
  url.searchParams.set("per_page", "1");
  return url;
}

async function parseDeployList(
  response: Response,
  projectName: string,
): Promise<unknown[]> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error(
      `Netlify deploy lookup for "${projectName}" returned a non-JSON response body.`,
      { cause },
    );
  }
  if (!Array.isArray(body)) {
    throw new Error(
      `Netlify deploy lookup for "${projectName}" returned a non-array response body.`,
    );
  }
  return body;
}

async function requestDeployList(
  fetchImpl: FetchImpl,
  authToken: string,
  projectName: string,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetchImpl(buildLatestDeployUrl(projectName), {
      headers: { Authorization: `Bearer ${authToken}` },
      signal,
    });
  } catch (cause) {
    if (signal.aborted) {
      throw new Error(
        `Netlify deploy lookup for "${projectName}" was aborted (timed out after ${NETLIFY_REQUEST_TIMEOUT_MS}ms or the sync's shared run budget was exhausted).`,
        { cause },
      );
    }
    throw cause;
  }
}

/**
 * Builds the real, network-touching `FetchLatestProductionDeploy`. `fetchImpl`
 * is injectable so the provider and client are tested with a fake fetch.
 */
export function createNetlifyDeployFetcher(
  authToken: string,
  fetchImpl: FetchImpl = fetch,
  deadline: FetchDeadline = NO_DEADLINE,
): FetchLatestProductionDeploy {
  return async (projectName): Promise<NetlifyDeploy | null> => {
    const signal = AbortSignal.any([
      AbortSignal.timeout(NETLIFY_REQUEST_TIMEOUT_MS),
      deadline.signal,
    ]);
    const response = await requestDeployList(
      fetchImpl,
      authToken,
      projectName,
      signal,
    );
    if (!response.ok) {
      throw new Error(
        `Netlify deploy lookup for "${projectName}" failed with status ${response.status}.`,
      );
    }
    const [latestDeploy] = await parseDeployList(response, projectName);
    return latestDeploy === undefined ? null : toNetlifyDeploy(latestDeploy);
  };
}
