import { NO_DEADLINE, type FetchDeadline } from "../types";
import {
  nextBranchCursor,
  toNeonBranchList,
  toNeonProjectUsage,
} from "./mapping";
import type { NeonBranchSummary, NeonClient } from "./types";

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
// A hung Neon request would otherwise block a sync indefinitely; same
// reasoning as sentryClient.ts's SENTRY_REQUEST_TIMEOUT_MS.
const NEON_REQUEST_TIMEOUT_MS = 10_000;
const BRANCHES_PAGE_SIZE = 100;
// Guards against a misbehaving cursor looping forever. A free-plan project is
// capped at 10 branches, so one page is the realistic case.
const MAX_BRANCH_PAGES = 5;

// Only the subset of the global `fetch` this client calls, so tests inject a
// lightweight double (same seam as sentryClient.ts).
type FetchImpl = typeof fetch;

async function getJson(
  fetchImpl: FetchImpl,
  url: URL,
  apiKey: string,
  deadline: FetchDeadline,
): Promise<unknown> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(NEON_REQUEST_TIMEOUT_MS),
    deadline.signal,
  ]);
  // The key is never part of an error message: only the path and status are.
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(
      `Neon API request ${url.pathname} failed with status ${response.status}.`,
    );
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new Error(
      `Neon API request ${url.pathname} returned a non-JSON response body.`,
      { cause },
    );
  }
}

function projectUrl(projectId: string, suffix = ""): URL {
  // projectId can come from integration_config.external_id (DB-writable), so
  // it is encoded before joining into the path.
  return new URL(
    `${NEON_API_BASE_URL}/projects/${encodeURIComponent(projectId)}${suffix}`,
  );
}

/**
 * Builds the real, network-touching `NeonClient`. `fetchImpl` defaults to the
 * global `fetch` but is injectable for tests.
 */
export function createNeonClient(
  apiKey: string,
  fetchImpl: FetchImpl = fetch,
  deadline: FetchDeadline = NO_DEADLINE,
): NeonClient {
  async function listBranches(projectId: string): Promise<NeonBranchSummary[]> {
    const branches: NeonBranchSummary[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_BRANCH_PAGES; page++) {
      const url = projectUrl(projectId, "/branches");
      url.searchParams.set("limit", String(BRANCHES_PAGE_SIZE));
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const body = await getJson(fetchImpl, url, apiKey, deadline);
      branches.push(...toNeonBranchList(body));
      cursor = nextBranchCursor(body);
      if (!cursor) {
        return branches;
      }
    }
    throw new Error(
      `Neon branch listing exceeded ${MAX_BRANCH_PAGES} pages; refusing to loop indefinitely.`,
    );
  }

  return {
    async getProjectUsage(projectId) {
      const body = await getJson(
        fetchImpl,
        projectUrl(projectId),
        apiKey,
        deadline,
      );
      return toNeonProjectUsage(body);
    },
    listBranches,
  };
}
