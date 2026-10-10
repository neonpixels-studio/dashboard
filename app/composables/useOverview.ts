import type { OverviewResponse } from "#shared/types/dashboard";
import {
  DEFAULT_OVERVIEW_RANGE,
  type OverviewRangeDays,
} from "#shared/constants/overviewRange";
import type { Ref } from "vue";
import { usePollingRefresh } from "./usePollingRefresh";

// Wraps `GET /api/overview` for the "/" rollup tiles (wired in issue #18).
// The read API already returns exactly the shape the tiles need, so this
// composable only narrows `useFetch`'s wider return surface down to the
// typed data/loading/error contract callers actually use. `range` is the
// selected window in days; useFetch watches the reactive query and refetches
// when it changes. The server re-validates it, so this never has to.
export function useOverview(
  range: Ref<OverviewRangeDays> = ref(DEFAULT_OVERVIEW_RANGE),
) {
  const { data, pending, error, refresh } = useFetch<OverviewResponse>(
    "/api/overview",
    { key: "overview", query: { range } },
  );
  usePollingRefresh(refresh);
  return { data, pending, error, refresh };
}
