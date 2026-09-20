import { toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import type { AppDetailResponse } from "#shared/types/dashboard";

// Wraps `GET /api/apps/[slug]` for the property detail page (wired in issue
// #20). `slug` accepts a ref/getter so callers can pass a reactive route
// param (`() => route.params.slug`) directly — the fetch key and URL both
// re-derive from it, so switching properties re-fetches instead of reusing
// a stale cache entry under the previous slug.
export function useApp(slug: MaybeRefOrGetter<string>) {
  const { data, pending, error, refresh } = useFetch<AppDetailResponse>(
    () => `/api/apps/${toValue(slug)}`,
    { key: () => `app-detail-${toValue(slug)}` },
  );
  return { data, pending, error, refresh };
}
