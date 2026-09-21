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

    <div class="card sessions-panel">
      <div class="panel-head">
        <span class="panel-title">Sessions</span>
        <span class="panel-meta">GOOGLE ANALYTICS · DAILY</span>
      </div>
      <SparkLine
        v-if="sessionsPath"
        :path="sessionsPath"
        width="100%"
        :height="130"
        view-box="0 0 600 130"
        :color="sessionsColor"
        :stroke-width="2.4"
        filled
        :fill-color="`color-mix(in srgb, ${sessionsColor} 7%, transparent)`"
        :grid-lines="[12, 51, 90, 129]"
        :aria-label="`${app.name} daily sessions over the last 30 days`"
      />
      <p v-else class="empty-chart-note">
        Not enough synced data for a trend line yet.
      </p>
      <AxisRow v-if="sessionsPath" :labels="sessionsAxisLabels" />
    </div>

    <div v-if="trafficSourceItems.length" class="bottom-row">
      <div class="card bottom-card">
        <span class="metric-label">TRAFFIC SOURCES</span>
        <StatList :items="trafficSourceItems" />
      </div>
    </div>

    <SourcesFooter :sources="sourceChips" />
  </DetailStateShell>
</template>

<script setup lang="ts">
import type { AppDetailTemplateProps } from "~/utils/appViewModel";
import {
  buildMetricTileData,
  dailySessionsPoints,
  METRIC_NEW_USERS,
  METRIC_OPEN_ISSUES,
  METRIC_SESSIONS,
  METRIC_USERS,
  PERIOD_30D,
  PERIOD_CURRENT,
} from "~/utils/metricTile";
import { buildSourceChips } from "~/utils/syncSource";
import { buildAxisLabels, buildSparklinePath } from "~/utils/sparklinePath";
import { buildTrafficSourceItems } from "~/utils/trafficPanel";

const props = defineProps<AppDetailTemplateProps>();

const SESSIONS_VIEWBOX_WIDTH = 600;
const SESSIONS_VIEWBOX_HEIGHT = 130;

// The studio site charts sessions in neutral white; product/marketing
// properties use their own accent.
const sessionsColor = computed(() =>
  props.app.isStudioSite ? "var(--ink)" : props.app.accent,
);

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

const sessionsPath = computed(() => {
  const points = dailySessionsPoints(props.app.detail?.series ?? []);
  return points
    ? buildSparklinePath(
        points,
        SESSIONS_VIEWBOX_WIDTH,
        SESSIONS_VIEWBOX_HEIGHT,
      )
    : "";
});

const sessionsAxisLabels = computed(() => {
  const points = dailySessionsPoints(props.app.detail?.series ?? []);
  return points ? buildAxisLabels(points) : [];
});

const trafficSourceItems = computed(() =>
  buildTrafficSourceItems(props.app.detail?.trafficBreakdown ?? []),
);

const sourceChips = computed(() =>
  buildSourceChips(props.app.detail?.sources ?? []),
);
</script>

<style scoped>
.sessions-panel {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
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
.empty-chart-note {
  margin: 0;
  font-size: 11px;
  color: var(--ink-3);
}
.bottom-row {
  display: flex;
  gap: 16px;
}
.bottom-card {
  flex: 1;
  min-width: 0;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
</style>
