// A route-table fake of the global fetch for the GitHub client: each route is
// keyed by URL pathname and is either a JSON body (served as 200) or a
// function building the Response, so a test can serve Link headers, errors or
// per-page bodies. An unrouted request fails loudly instead of returning
// something plausible.
export type FakeRoute = unknown | ((url: URL, init?: RequestInit) => Response);

export interface FakeGithubFetch {
  fetchImpl: typeof fetch;
  requests: { url: URL; init?: RequestInit }[];
}

export function jsonOk(body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers });
}

export function fakeGithubFetch(
  routes: Record<string, FakeRoute>,
): FakeGithubFetch {
  const requests: FakeGithubFetch["requests"] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    const route = routes[url.pathname];
    if (route === undefined) {
      throw new Error(`Unrouted GitHub request: ${url.pathname}`);
    }
    return typeof route === "function" ? route(url, init) : jsonOk(route);
  }) as typeof fetch;
  return { fetchImpl, requests };
}

export function rawIssue(
  number: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    number,
    title: `Item ${number}`,
    html_url: `https://github.com/neonpixels-studio/basin/issues/${number}`,
    updated_at: "2026-10-09T12:00:00Z",
    labels: [],
    ...overrides,
  };
}

export function rawPull(number: number) {
  return rawIssue(number, {
    html_url: `https://github.com/neonpixels-studio/basin/pull/${number}`,
    pull_request: { url: "https://api.github.com/..." },
  });
}

// The three endpoints a repo's CI comes from, for a given head commit.
export function mainCiRoutes(
  repo: string,
  options: {
    sha?: string;
    runs?: {
      status: string;
      conclusion: string | null;
      event: string;
      workflow_id?: number;
      created_at?: string;
    }[];
    statusState?: string;
    statusCount?: number;
  } = {},
): Record<string, FakeRoute> {
  const {
    sha = "sha-main",
    runs = [{ status: "completed", conclusion: "success", event: "push" }],
    statusState = "pending",
    statusCount = 0,
  } = options;
  const base = `/repos/neonpixels-studio/${repo}`;
  return {
    [`${base}/commits/main`]: {
      sha,
      commit: { committer: { date: "2026-10-09T08:00:00Z" } },
    },
    [`${base}/actions/runs`]: {
      total_count: runs.length,
      // Distinct workflows unless a test pins workflow_id.
      workflow_runs: runs.map((workflowRun, index) => ({
        workflow_id: index + 1,
        created_at: "2026-10-09T08:00:00Z",
        ...workflowRun,
      })),
    },
    [`${base}/commits/${sha}/status`]: {
      state: statusState,
      total_count: statusCount,
    },
  };
}
