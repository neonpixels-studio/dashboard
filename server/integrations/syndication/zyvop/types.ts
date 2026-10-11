// Plain, JSON-serializable subset of a post returned by ZyVOP's
// `zyvop_list_posts` MCP tool (https://zyvop.com/api-docs). mapping.ts is the
// one place that translates this into the shared ../types.ts
// SyndicationSourcePost shape.
export interface ZyvopPost {
  id: string;
  slug: string;
  publishedAt: string;
  views: number;
  // Confirmed 2026-10-10 against zyvop_list_posts: url is
  // https://zyvop.com/<slug> and the tool reports no comment count. Still
  // optional because mapping.ts reads each only when present and well-formed.
  url?: string;
  likes?: number;
}

// The seam provider.ts's core logic is tested against instead of a real
// network call: createZyvopPostsPageFetcher (zyvopClient.ts) builds the real
// implementation. `offset` mirrors the tool's own offset/limit pagination.
export type FetchZyvopPostsPage = (offset: number) => Promise<ZyvopPost[]>;
