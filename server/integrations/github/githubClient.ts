import { NO_DEADLINE, type FetchDeadline } from "../types";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
// One timer covers a request including reading its body.
const GITHUB_REQUEST_TIMEOUT_MS = 20_000;
const GITHUB_PAGE_SIZE = 100;
// A runaway Link chain must fail loud, not loop the sync until the deadline.
const GITHUB_MAX_PAGES = 50;
const NEXT_LINK_PATTERN = /<([^>]+)>;\s*rel="next"/;

export type GithubQuery = Record<string, string | number>;
export type PickPageItems = (body: unknown) => unknown[];

// Narrow on purpose so a later caller (e.g. workflow dispatch) adds a method
// here rather than reaching for its own fetch. Bodies are `unknown`: callers
// validate the shape they read (see mapping.ts).
export interface GithubClient {
  get(path: string, query?: GithubQuery): Promise<unknown>;
  // Follows Link rel="next" until exhausted. Each page must be an array, or
  // pass `pickItems` for an endpoint that wraps it (e.g. { workflow_runs }).
  getAllPages(
    path: string,
    query?: GithubQuery,
    pickItems?: PickPageItems,
  ): Promise<unknown[]>;
}

export interface GithubClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  deadline?: FetchDeadline;
  baseUrl?: string;
}

interface GithubResponseBody {
  body: unknown;
  nextUrl: URL | null;
}

function buildUrl(baseUrl: string, path: string, query: GithubQuery): URL {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

// The token rides on every request, so a Link header must never be able to
// send it to another host.
function parseNextUrl(linkHeader: string | null, baseUrl: string): URL | null {
  const nextLink = linkHeader ? NEXT_LINK_PATTERN.exec(linkHeader)?.[1] : null;
  if (!nextLink) {
    return null;
  }
  const nextUrl = new URL(nextLink);
  if (nextUrl.origin !== new URL(baseUrl).origin) {
    throw new Error(`GitHub Link header points off-host: "${nextUrl.origin}".`);
  }
  return nextUrl;
}

async function parseJson(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new Error(`GitHub ${label} returned a non-JSON response body.`, {
      cause,
    });
  }
}

function abortedError(
  timeoutController: AbortController,
  deadline: FetchDeadline,
  label: string,
  cause: unknown,
): Error | null {
  if (deadline.signal.aborted) {
    return new Error(
      `GitHub ${label} was aborted because the sync's shared run budget was exhausted.`,
      { cause },
    );
  }
  if (timeoutController.signal.aborted) {
    return new Error(
      `GitHub ${label} timed out after ${GITHUB_REQUEST_TIMEOUT_MS}ms.`,
      { cause },
    );
  }
  return null;
}

function requestHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

async function readResponse(
  response: Response,
  label: string,
  baseUrl: string,
): Promise<GithubResponseBody> {
  if (!response.ok) {
    throw new Error(`GitHub ${label} failed with status ${response.status}.`);
  }
  return {
    body: await parseJson(response, label),
    nextUrl: parseNextUrl(response.headers.get("link"), baseUrl),
  };
}

async function requestOnce(
  options: Required<GithubClientOptions>,
  url: URL,
): Promise<GithubResponseBody> {
  const label = `GET ${url.pathname}`;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    GITHUB_REQUEST_TIMEOUT_MS,
  );
  const signal = AbortSignal.any([
    timeoutController.signal,
    options.deadline.signal,
  ]);

  try {
    const response = await options.fetchImpl(url, {
      headers: requestHeaders(options.token),
      signal,
    });
    return await readResponse(response, label, options.baseUrl);
  } catch (cause) {
    throw (
      abortedError(timeoutController, options.deadline, label, cause) ?? cause
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function assertWithinPageLimit(page: number, firstUrl: URL): void {
  if (page >= GITHUB_MAX_PAGES) {
    throw new Error(
      `GitHub GET ${firstUrl.pathname} exceeded ${GITHUB_MAX_PAGES} pages.`,
    );
  }
}

function requireArrayPage(body: unknown, firstUrl: URL): unknown[] {
  if (!Array.isArray(body)) {
    throw new Error(
      `GitHub GET ${firstUrl.pathname} returned a non-array page.`,
    );
  }
  return body;
}

function defaultPickItems(firstUrl: URL): PickPageItems {
  return (body) => requireArrayPage(body, firstUrl);
}

async function collectPages(
  options: Required<GithubClientOptions>,
  firstUrl: URL,
  pickItems: PickPageItems,
): Promise<unknown[]> {
  const items: unknown[] = [];
  let nextUrl: URL | null = firstUrl;
  for (let page = 0; nextUrl; page++) {
    assertWithinPageLimit(page, firstUrl);
    const response: GithubResponseBody = await requestOnce(options, nextUrl);
    items.push(...pickItems(response.body));
    nextUrl = response.nextUrl;
  }
  return items;
}

export function createGithubClient(clientOptions: GithubClientOptions) {
  // Field by field so an explicitly passed `undefined` still gets its default.
  const options: Required<GithubClientOptions> = {
    token: clientOptions.token,
    fetchImpl: clientOptions.fetchImpl ?? fetch,
    deadline: clientOptions.deadline ?? NO_DEADLINE,
    baseUrl: clientOptions.baseUrl ?? GITHUB_API_BASE_URL,
  };
  const client: GithubClient = {
    async get(path, query = {}) {
      const { body } = await requestOnce(
        options,
        buildUrl(options.baseUrl, path, query),
      );
      return body;
    },
    getAllPages(path, query = {}, pickItems) {
      const firstUrl = buildUrl(options.baseUrl, path, {
        per_page: GITHUB_PAGE_SIZE,
        ...query,
      });
      return collectPages(
        options,
        firstUrl,
        pickItems ?? defaultPickItems(firstUrl),
      );
    },
  };
  return client;
}
