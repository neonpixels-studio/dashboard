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

    <SectionLabel
      label="TRAFFIC"
      meta="GOOGLE ANALYTICS · GA4"
      class="section-gap"
    >
      <template #action>
        <Ga4ViewLink :detail="app.detail" />
      </template>
    </SectionLabel>

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
  isMetricIntegrated,
  PERIOD_30D,
  PERIOD_CURRENT,
} from "~/utils/metricTile";
import { useAppDetailPanels } from "~/composables/useAppDetailPanels";

const props = defineProps<AppDetailTemplateProps>();

const TILE_SPECS = [
  { metric: METRIC_SESSIONS, period: PERIOD_30D },
  { metric: METRIC_USERS, period: PERIOD_CURRENT },
  { metric: METRIC_NEW_USERS, period: PERIOD_30D },
  { metric: METRIC_OPEN_ISSUES, period: PERIOD_CURRENT },
];

// Tiles for vendors this property has no integration with are dropped
// rather than rendered as an empty "Not synced yet" placeholder.
const tiles = computed(() => {
  const metrics = props.app.detail?.metrics ?? [];
  const series = props.app.detail?.series ?? [];
  const integrations = props.app.detail?.integrations ?? [];
  const specs = TILE_SPECS.filter((spec) =>
    isMetricIntegrated(spec.metric, integrations),
  );
  return specs.map((spec) =>
    buildMetricTileData(spec.metric, spec.period, metrics, series),
  );
});

const { trafficPanelData, sourceChips } = useAppDetailPanels(
  () => props.app.detail,
);
</script>

<style scoped>
.section-gap {
  margin-top: 6px;
}
</style>
