<template>
  <DetailStateShell
    :pending="pending"
    :error="error"
    :last-synced-at="app.detail?.lastSyncedAt ?? null"
    :refresh="refresh"
    :alerts="app.detail?.alerts ?? []"
    :has-data="!!app.detail"
  >
    <template #pending>
      <MetricTileGrid :tiles="[]" pending />
      <SkeletonBlock height="200px" radius="var(--r-lg)" />
    </template>

    <MetricTileGrid :tiles="tiles" />

    <TrafficPanel
      :app="app"
      :stats="trafficPanelData.stats"
      :delta="trafficPanelData.delta"
      :path="trafficPanelData.path"
      :axis-labels="trafficPanelData.axisLabels"
      :lists="trafficPanelData.lists"
    />

    <SourcesFooter :sources="sourceChips" />
  </DetailStateShell>
</template>

<script setup lang="ts">
import type { AppDetailTemplateProps } from "~/utils/appViewModel";
import {
  buildMetricTileData,
  METRIC_NEW_USERS,
  METRIC_OPEN_ISSUES,
  METRIC_SESSIONS,
  METRIC_USERS,
  PERIOD_30D,
  PERIOD_CURRENT,
} from "~/utils/metricTile";
import { useAppDetailPanels } from "~/composables/useAppDetailPanels";

const props = defineProps<AppDetailTemplateProps>();

const tiles = computed(() => {
  const metrics = props.app.detail?.metrics ?? [];
  const series = props.app.detail?.series ?? [];
  return [
    buildMetricTileData(METRIC_SESSIONS, PERIOD_30D, metrics, series),
    buildMetricTileData(METRIC_USERS, PERIOD_CURRENT, metrics, series),
    buildMetricTileData(METRIC_NEW_USERS, PERIOD_30D, metrics, series),
    buildMetricTileData(METRIC_OPEN_ISSUES, PERIOD_CURRENT, metrics, series),
  ];
});

const { trafficPanelData, sourceChips } = useAppDetailPanels(
  () => props.app.detail,
);
</script>
