import { fetchJson } from "../httpClient";
import type {
  FetchHashnodePostsPage,
  HashnodePostNode,
  HashnodePostsPage,
} from "./types";

// Hashnode's public GraphQL API — a single POST endpoint, per
// https://apidocs.hashnode.com/ (the legacy REST-ish api.hashnode.com is
// discontinued). Confirm against a live token before assuming this changes —
// this environment has no network access to verify.
const HASHNODE_GRAPHQL_ENDPOINT = "https://gql.hashnode.com/";
const POSTS_PAGE_SIZE = 20;

// Queries by publication id (not `host`) — `NUXT_HASHNODE_PUBLICATION_ID`
// (see .env.example) is the id the README already documents copying from
// the publication's own dashboard, not its domain. Only the fields
// ./types.ts's HashnodePostNode needs are requested.
const POSTS_QUERY = `
  query PublicationPosts($publicationId: ObjectId!, $first: Int!, $after: String) {
    publication(id: $publicationId) {
      posts(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            slug
            publishedAt
          }
        }
      }
    }
  }
`;

interface HashnodeGraphQlError {
  message: string;
}

interface HashnodeGraphQlResponse {
  data?: {
    publication: {
      posts: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: HashnodePostNode }[];
      };
    } | null;
  };
  errors?: HashnodeGraphQlError[];
}

function assertNoGraphQlErrors(body: HashnodeGraphQlResponse): void {
  if (body.errors?.length) {
    throw new Error(
      `Hashnode API returned errors: ${body.errors.map((error) => error.message).join("; ")}`,
    );
  }
}

/**
 * Builds the real, network-touching `FetchHashnodePostsPage`. `fetchImpl`
 * defaults to the global `fetch` (via ../httpClient's fetchJson) but is
 * injectable — this is the one function in
 * server/integrations/syndication/hashnode that would otherwise make a live
 * HTTP call with no seam, unlike mapping.ts/provider.ts, which are tested
 * against a fixture-backed fake with the same signature.
 */
export function createHashnodePostsPageFetcher(
  publicationId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): FetchHashnodePostsPage {
  return async (after: string | null): Promise<HashnodePostsPage> => {
    const body = await fetchJson<HashnodeGraphQlResponse>(
      HASHNODE_GRAPHQL_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({
          query: POSTS_QUERY,
          variables: { publicationId, first: POSTS_PAGE_SIZE, after },
        }),
        fetchImpl,
        vendorLabel: "Hashnode API",
      },
    );
    assertNoGraphQlErrors(body);

    const publication = body.data?.publication;
    if (!publication) {
      throw new Error(
        `Hashnode publication "${publicationId}" was not found — check NUXT_HASHNODE_PUBLICATION_ID (or the integration_config row's external_id).`,
      );
    }

    return {
      nodes: publication.posts.edges.map((edge) => edge.node),
      hasNextPage: publication.posts.pageInfo.hasNextPage,
      endCursor: publication.posts.pageInfo.endCursor,
    };
  };
}
