// Plain, JSON-serializable subset of the RapidAPI-hosted "medium2" API
// (docs.mediumapi.com / rapidapi.com/nishujain199719-vgIfuFHxLd0/api/medium2
// — the unofficial, paid third-party read API the issue calls "mediumapi.com";
// see .env.example and README.md's "Blog platforms" section, which already
// named this specific vendor before this file existed) response shapes this
// provider needs. UNVERIFIED against a live response: this environment has
// no network access and no paid key has been provisioned yet to record one
// (see mapping.ts's toPostRef and provider.ts's top-of-file comment) — same
// caveat server/integrations/ga4/provider.ts's CHANNEL_DIMENSION_NAME
// carries for an assumption that couldn't be confirmed live. Field names are
// taken from the endpoints' publicly documented example payloads; confirm
// against a real key before trusting this in production.
export interface MediumUserIdResponse {
  id: string;
}

// GET /user/{user_id}/articles — `associated_articles` is a list of
// same-sized "pages" of article ids (per the documented example response),
// not a flat list; mediumClient.ts flattens it.
export interface MediumUserArticlesResponse {
  associated_articles: string[][];
  count: number;
}

export interface MediumArticleInfo {
  unique_slug: string;
  // Either epoch milliseconds (Medium's own internal API convention, which
  // mediumapi.com is documented elsewhere as wrapping) OR a
  // "YYYY-MM-DD HH:mm:ss" UTC string (the shape shown in some published
  // mediumapi.com examples) — genuinely unverified which one a live account
  // returns (see the file comment above), so mapping.ts's toSyndicationSourcePost
  // handles both rather than betting on either.
  published_at: number | string;
}

// The seams provider.ts's core logic is tested against instead of real
// network calls: mediumClient.ts's create* functions build the real
// implementations; provider unit tests substitute fixture-backed fakes with
// these same signatures.
export type ListMediumArticleIds = () => Promise<string[]>;
export type FetchMediumArticleInfo = (
  articleId: string,
) => Promise<MediumArticleInfo>;
