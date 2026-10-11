// Plain, JSON-serializable subset of the Forem/DEV.to REST API's article
// shape this provider needs (GET /api/articles/me/published — per
// https://developers.forem.com/api). mapping.ts is the one place that
// translates this into the shared ../types.ts SyndicationSourcePost shape.
export interface DevtoArticle {
  id: number;
  slug: string;
  published_at: string;
  // Lifetime views. Only present on the authenticated /articles/me/* endpoints.
  page_views_count: number;
  // The article's public dev.to address.
  url: string;
  // Reactions of every kind (the number dev.to shows next to the heart).
  public_reactions_count: number;
  comments_count: number;
}

// The seam devtoProvider.ts's core logic is tested against instead of a real
// network call: createDevtoArticlesPageFetcher (devtoClient.ts) builds the
// real implementation; provider unit tests substitute a fixture-backed fake
// with the same signature. `page` mirrors the Forem API's own 1-based
// page-number pagination.
export type FetchDevtoArticlesPage = (page: number) => Promise<DevtoArticle[]>;
