// Plain, JSON-serializable subset of a post returned by ZyVOP's
// `zyvop_list_posts` MCP tool (https://zyvop.com/api-docs). mapping.ts is the
// one place that translates this into the shared ../types.ts
// SyndicationSourcePost shape.
export interface ZyvopPost {
  id: string;
  slug: string;
  publishedAt: string;
  views: number;
}

// The seam provider.ts's core logic is tested against instead of a real
// network call: createZyvopPostsPageFetcher (zyvopClient.ts) builds the real
// implementation. `offset` mirrors the tool's own offset/limit pagination.
export type FetchZyvopPostsPage = (offset: number) => Promise<ZyvopPost[]>;
