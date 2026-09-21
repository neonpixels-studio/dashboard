// Plain, JSON-serializable subset of Hashnode's GraphQL Public API response
// this provider needs — deliberately hand-rolled rather than any generated
// GraphQL SDK type, since hashnodeClient.ts sends one fixed query and reads
// back exactly these fields. mapping.ts is the one place that translates
// this into the shared ../types.ts SyndicationSourcePost shape.
export interface HashnodePostNode {
  id: string;
  slug: string;
  publishedAt: string;
}

export interface HashnodePostsPage {
  nodes: HashnodePostNode[];
  hasNextPage: boolean;
  endCursor: string | null;
}

// The seam hashnodeProvider.ts's core logic is tested against instead of a
// real network call: createHashnodePostsPageFetcher (hashnodeClient.ts)
// builds the real implementation; provider unit tests substitute a
// fixture-backed fake with the same signature. `after` mirrors Hashnode's own
// GraphQL cursor-pagination argument (`null` for the first page).
export type FetchHashnodePostsPage = (
  after: string | null,
) => Promise<HashnodePostsPage>;
