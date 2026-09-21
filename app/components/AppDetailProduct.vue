<template>
  <DetailStateShell
    :pending="pending"
    :error="error"
    :last-synced-at="app.detail?.lastSyncedAt ?? null"
    :refresh="refresh"
  >
    <template #pending>
      <div class="detail-body">
        <MetricTileGrid :tiles="[]" pending :tile-count="TILE_COUNT" />
        <SkeletonBlock height="180px" radius="var(--r-lg)" />
        <SkeletonBlock height="220px" radius="var(--r-lg)" />
      </div>
    </template>

    <div class="detail-body">
      <ul v-if="alerts.length" class="alerts-list">
        <li v-for="alert in alerts" :key="alert.vendor">
          <AppAlert
            tone="err"
            :title="`${alert.vendor.toUpperCase()} sync failing`"
          >
            {{ alert.message }}
          </AppAlert>
        </li>
      </ul>

      <MetricTileGrid :tiles="tiles" />

      <div class="card sessions-panel">
        <div class="panel-head">
          <span class="panel-title">Sessions</span>
          <span class="panel-meta">GOOGLE ANALYTICS · DAILY</span>
        </div>
        <PropertySessionsChart
          :series="sessionsChartSeries"
          :aria-label="`Daily sessions for ${app.name} over the last 30 days.`"
        />
        <AxisRow />
      </div>

      <SectionLabel label="MONEY &amp; HEALTH" meta="STRIPE · SENTRY" />
      <AppDetailProductMoneyHealthPanel :app="app" />

      <SectionLabel label="USERS &amp; AUTH" meta="CLERK" class="section-gap" />
      <AppDetailProductAuthPanel :app="app" />

      <SectionLabel
        label="TRAFFIC"
        meta="GOOGLE ANALYTICS · GA4"
        class="section-gap"
      />

      <TrafficPanel
        :app="app"
        :stats="trafficPanelData.stats"
        :delta="trafficPanelData.delta"
        :path="trafficPanelData.path"
        :lists="trafficPanelData.lists"
      />

      <SourcesFooter :sources="sourceChips" />
    </div>
  </DetailStateShell>
</template>

<script setup lang="ts">
import type { AppDetailTemplateProps } from "~/utils/appViewModel";
import {
  buildMetricTileData,
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_MRR,
  METRIC_OPEN_ISSUES,
  METRIC_SESSIONS,
  METRIC_USERS,
  PERIOD_CURRENT,
  PERIOD_DAILY,
} from "~/utils/metricTile";
import { buildSparklinePath, sparklineEndY } from "~/utils/sparklinePath";
import { useAppDetailPanels } from "~/composables/useAppDetailPanels";

const props = defineProps<AppDetailTemplateProps>();

const TILE_COUNT = 4;
const SESSIONS_CHART_VIEWBOX_WIDTH = 900;
const SESSIONS_CHART_VIEWBOX_HEIGHT = 200;

const alerts = computed(() => props.app.detail?.alerts ?? []);

const tiles = computed(() => {
  const metrics = props.app.detail?.metrics ?? [];
  const series = props.app.detail?.series ?? [];
  return [
    buildMetricTileData(METRIC_MRR, PERIOD_CURRENT, metrics, series),
    buildMetricTileData(
      METRIC_ACTIVE_SUBSCRIBERS,
      PERIOD_CURRENT,
      metrics,
      series,
    ),
    buildMetricTileData(METRIC_USERS, PERIOD_CURRENT, metrics, series),
    buildMetricTileData(METRIC_OPEN_ISSUES, PERIOD_CURRENT, metrics, series),
  ];
});

const sessionsChartSeries = computed(() => {
  const dailySessions = props.app.detail?.series.find(
    (series) =>
      series.metric === METRIC_SESSIONS && series.period === PERIOD_DAILY,
  );
  if (!dailySessions || dailySessions.points.length < 2) {
    return [];
  }
  return [
    {
      slug: props.app.slug,
      color: props.app.accent,
      path: buildSparklinePath(
        dailySessions.points,
        SESSIONS_CHART_VIEWBOX_WIDTH,
        SESSIONS_CHART_VIEWBOX_HEIGHT,
      ),
      endY: sparklineEndY(dailySessions.points, SESSIONS_CHART_VIEWBOX_HEIGHT),
    },
  ];
});

const { trafficPanelData, sourceChips } = useAppDetailPanels(
  () => props.app.detail,
);
</script>

<style scoped>
.detail-body {
  flex-grow: 1;
  padding: 24px 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.alerts-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-gap {
  margin-top: 8px;
}
.sessions-panel {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.panel-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
</style>
