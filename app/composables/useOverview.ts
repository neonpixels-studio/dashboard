import type { OverviewResponse } from "#shared/types/dashboard";

// Wraps `GET /api/overview` for the "/" rollup tiles (wired in issue #18).
// The read API already returns exactly the shape the tiles need, so this
// composable only narrows `useFetch`'s wider return surface down to the
// typed data/loading/error contract callers actually use.
export function useOverview() {
  const { data, pending, error, refresh } = useFetch<OverviewResponse>(
    "/api/overview",
    { key: "overview" },
  );
  return { data, pending, error, refresh };
}
