import { toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import type { AppDetailResponse } from "#shared/types/dashboard";

// Wraps `GET /api/apps/[slug]` for the property detail page (wired in issue
// #20). `slug` accepts a ref/getter so callers can pass a reactive route
// param (`() => route.params.slug`) directly — the fetch key and URL both
// re-derive from it, so switching properties re-fetches instead of reusing
// a stale cache entry under the previous slug.
export function useApp(slug: MaybeRefOrGetter<string>) {
  // Encoded once per call so a slug containing `/`, `?`, or `#` can't change
  // the request path or inject a query string into our own endpoint.
  const encodedSlug = () => encodeURIComponent(toValue(slug));
  const { data, pending, error, refresh } = useFetch<AppDetailResponse>(
    () => `/api/apps/${encodedSlug()}`,
    { key: () => `app-detail-${encodedSlug()}` },
  );
  return { data, pending, error, refresh };
}
