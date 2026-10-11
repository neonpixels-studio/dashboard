import { toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import type { SentryPanelResponse } from "#shared/types/dashboard";

// Wraps `GET /api/apps/[slug]/sentry`. Deliberately not part of useApp: the
// endpoint calls Sentry live, so it loads and fails on its own and the rest of
// the detail page never waits on it. No polling, since each refresh is a live
// Sentry request against a 5 req/s limit.
export function useSentryPanel(slug: MaybeRefOrGetter<string>) {
  const encodedSlug = () => encodeURIComponent(toValue(slug));
  const { data, pending, error, refresh } = useFetch<SentryPanelResponse>(
    () => `/api/apps/${encodedSlug()}/sentry`,
    {
      key: () => `app-sentry-${encodedSlug()}`,
      enabled: () => toValue(slug).length > 0,
    },
  );
  return { data, pending, error, refresh };
}
