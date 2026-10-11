import type { AppDetailResponse } from "#shared/types/dashboard";
import { buildTrafficPanelData } from "~/utils/trafficPanel";
import { buildSourceChips } from "~/utils/syncSource";

// AppDetailProduct, AppDetailWriting and AppDetailMarketing all render a
// TrafficPanel and a SourcesFooter from the same AppDetailResponse — this
// composable is that one shared pair of computeds instead of each template
// repeating it (fallow's duplication gate flagged the repeated block).
export function useAppDetailPanels(detail: () => AppDetailResponse | null) {
  const trafficPanelData = computed(() => buildTrafficPanelData(detail()));
  const sourceChips = computed(() => buildSourceChips(detail()?.sources ?? []));
  return { trafficPanelData, sourceChips };
}
