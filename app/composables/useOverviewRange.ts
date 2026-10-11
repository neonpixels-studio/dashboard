import {
  DEFAULT_OVERVIEW_RANGE,
  parseOverviewRange,
  type OverviewRangeDays,
} from "#shared/constants/overviewRange";

// The overview range lives in the URL (`?range=7`) so a reload or shared
// link keeps it. The default is left out of the query to keep "/" clean;
// unknown values parse back to the default.
export function useOverviewRange() {
  const route = useRoute();
  const router = useRouter();

  const range = computed(() => parseOverviewRange(route.query.range));

  function setRange(next: OverviewRangeDays) {
    const query = { ...route.query };
    if (next === DEFAULT_OVERVIEW_RANGE) {
      delete query.range;
    } else {
      query.range = String(next);
    }
    return router.replace({ query });
  }

  return { range, setRange };
}
