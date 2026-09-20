import type {
  FetchMediumArticleInfo,
  ListMediumArticleIds,
  MediumArticleInfo,
  MediumUserArticlesResponse,
  MediumUserIdResponse,
} from "./types";

// A hung request would otherwise block a sync indefinitely (no independent
// deadline on a Netlify function) — same reasoning as
// server/integrations/stripe/stripeClient.ts's STRIPE_REQUEST_TIMEOUT_MS.
const MEDIUM_REQUEST_TIMEOUT_MS = 20_000;
const MEDIUM_API_BASE_URL = "https://medium2.p.rapidapi.com";
const MEDIUM_API_HOST = "medium2.p.rapidapi.com";

async function mediumGet<ResponseBody>(
  path: string,
  rapidApiKey: string,
  fetchImpl: typeof fetch,
): Promise<ResponseBody> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    MEDIUM_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(`${MEDIUM_API_BASE_URL}${path}`, {
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": MEDIUM_API_HOST,
      },
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Medium API (${path}) responded with ${response.status} ${response.statusText}.`,
      );
    }
    return (await response.json()) as ResponseBody;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Builds the real, network-touching `ListMediumArticleIds`: resolves the
 * configured username to Medium's internal user id (GET
 * /user/id_for/{username}), then lists that user's article ids (GET
 * /user/{id}/articles). Two requests total, regardless of article count —
 * deliberately does NOT also fetch full article info here (see provider.ts's
 * MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC comment for why that's bounded and
 * separate); `fetchImpl` defaults to the global `fetch` but is injectable,
 * same as createHashnodePostsPageFetcher/createDevtoArticlesPageFetcher.
 */
export function createMediumArticleIdLister(
  username: string,
  rapidApiKey: string,
  fetchImpl: typeof fetch = fetch,
): ListMediumArticleIds {
  return async () => {
    const { id: userId } = await mediumGet<MediumUserIdResponse>(
      `/user/id_for/${encodeURIComponent(username)}`,
      rapidApiKey,
      fetchImpl,
    );
    const { associated_articles: articleIdPages } =
      await mediumGet<MediumUserArticlesResponse>(
        `/user/${encodeURIComponent(userId)}/articles`,
        rapidApiKey,
        fetchImpl,
      );
    return articleIdPages.flat();
  };
}

/**
 * Builds the real, network-touching `FetchMediumArticleInfo` (GET
 * /article/{article_id}). `fetchImpl` defaults to the global `fetch` but is
 * injectable, same as the lister above.
 */
export function createMediumArticleInfoFetcher(
  rapidApiKey: string,
  fetchImpl: typeof fetch = fetch,
): FetchMediumArticleInfo {
  return (articleId: string): Promise<MediumArticleInfo> =>
    mediumGet<MediumArticleInfo>(
      `/article/${encodeURIComponent(articleId)}`,
      rapidApiKey,
      fetchImpl,
    );
}
