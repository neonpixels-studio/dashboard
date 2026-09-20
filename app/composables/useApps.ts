import type { AppsResponse } from "#shared/types/dashboard";

// Wraps `GET /api/apps` for the per-property card grid (wired in issue #19).
export function useApps() {
  const { data, pending, error, refresh } = useFetch<AppsResponse>(
    "/api/apps",
    { key: "apps" },
  );
  return { data, pending, error, refresh };
}
