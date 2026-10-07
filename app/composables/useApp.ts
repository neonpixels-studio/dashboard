import { shallowRef, toValue, watch } from "vue";
import type { MaybeRefOrGetter } from "vue";
import type { AppDetailResponse } from "#shared/types/dashboard";
import { usePollingRefresh } from "./usePollingRefresh";

// Wraps `GET /api/apps/[slug]` for the property detail page (wired in issue
// #20). `slug` accepts a ref/getter so callers can pass a reactive route
// param (`() => route.params.slug`) directly — the fetch key and URL both
// re-derive from it, so switching properties re-fetches instead of reusing
// a stale cache entry under the previous slug.
//
// Nuxt resets `data` to the `default` value whenever a fetch errors, which
// would blank the whole page on a failed background refresh. `default`
// returns the last successful response for the current slug instead, so the
// page keeps showing it while `error` reports the failed refresh.
export function useApp(slug: MaybeRefOrGetter<string>) {
  // Encoded once per call so a slug containing `/`, `?`, or `#` can't change
  // the request path or inject a query string into our own endpoint.
  const encodedSlug = () => encodeURIComponent(toValue(slug));
  const lastGood = shallowRef<
    { slug: string; response: AppDetailResponse } | undefined
  >();
  const { data, pending, error, refresh } = useFetch<AppDetailResponse>(
    () => `/api/apps/${encodedSlug()}`,
    {
      key: () => `app-detail-${encodedSlug()}`,
      // An empty slug would otherwise request `/api/apps/` — Nitro's own
      // collection route (`GET /api/apps`, an `AppCard[]`) — and silently
      // hand back the wrong shape as if it were an `AppDetailResponse`.
      enabled: () => toValue(slug).length > 0,
      // Slug is checked so switching properties never shows another one's data.
      default: () =>
        lastGood.value?.slug === toValue(slug)
          ? lastGood.value.response
          : undefined,
    },
  );
  watch(
    data,
    (response) => {
      if (response) {
        lastGood.value = { slug: toValue(slug), response };
      }
    },
    { immediate: true },
  );
  usePollingRefresh(() => (toValue(slug).length > 0 ? refresh() : undefined));
  return { data, pending, error, refresh };
}
