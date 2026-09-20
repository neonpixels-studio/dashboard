import { fetchJson } from "../httpClient";
import type {
  FetchMediumArticleInfo,
  ListMediumArticleIds,
  MediumArticleInfo,
  MediumUserArticlesResponse,
  MediumUserIdResponse,
} from "./types";

const MEDIUM_API_BASE_URL = "https://medium2.p.rapidapi.com";
const MEDIUM_API_HOST = "medium2.p.rapidapi.com";

function mediumHeaders(rapidApiKey: string): Record<string, string> {
  return {
    "x-rapidapi-key": rapidApiKey,
    "x-rapidapi-host": MEDIUM_API_HOST,
  };
}

/**
 * Builds the real, network-touching `ListMediumArticleIds`: resolves the
 * configured username to Medium's internal user id (GET
 * /user/id_for/{username}), then lists that user's article ids (GET
 * /user/{id}/articles). Two requests total, regardless of article count —
 * deliberately does NOT also fetch full article info here (see provider.ts's
 * MEDIUM_MAX_ARTICLE_DETAILS_PER_SYNC comment for why that's bounded and
 * separate); `fetchImpl` defaults to the global `fetch` (via ../httpClient's
 * fetchJson) but is injectable, same as
 * createHashnodePostsPageFetcher/createDevtoArticlesPageFetcher.
 */
export function createMediumArticleIdLister(
  username: string,
  rapidApiKey: string,
  fetchImpl: typeof fetch = fetch,
): ListMediumArticleIds {
  return async () => {
    const idForPath = `/user/id_for/${encodeURIComponent(username)}`;
    const { id: userId } = await fetchJson<MediumUserIdResponse>(
      `${MEDIUM_API_BASE_URL}${idForPath}`,
      {
        headers: mediumHeaders(rapidApiKey),
        fetchImpl,
        vendorLabel: `Medium API (${idForPath})`,
      },
    );

    const articlesPath = `/user/${encodeURIComponent(userId)}/articles`;
    const { associated_articles: articleIdPages } =
      await fetchJson<MediumUserArticlesResponse>(
        `${MEDIUM_API_BASE_URL}${articlesPath}`,
        {
          headers: mediumHeaders(rapidApiKey),
          fetchImpl,
          vendorLabel: `Medium API (${articlesPath})`,
        },
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
  return (articleId: string): Promise<MediumArticleInfo> => {
    const path = `/article/${encodeURIComponent(articleId)}`;
    return fetchJson<MediumArticleInfo>(`${MEDIUM_API_BASE_URL}${path}`, {
      headers: mediumHeaders(rapidApiKey),
      fetchImpl,
      vendorLabel: `Medium API (${path})`,
    });
  };
}
