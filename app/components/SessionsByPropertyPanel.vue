<template>
  <div class="card sessions-panel">
    <div class="sessions-chart">
      <div class="panel-head">
        <span class="panel-title">Sessions by property</span>
        <span class="panel-meta">GOOGLE ANALYTICS · DAILY</span>
      </div>
      <SkeletonBlock v-if="pending" height="200px" />
      <DataErrorState
        v-else-if="hasError"
        message="Couldn't load sessions by property."
        @retry="emit('retry')"
      />
      <p v-else-if="!chartSeries.length" class="sessions-empty">
        No session data synced yet.
      </p>
      <template v-else>
        <PropertySessionsChart :series="chartSeries" :aria-label="ariaLabel" />
        <AxisRow :labels="axisLabels" />
      </template>
    </div>

    <div class="totals">
      <span class="metric-label totals-label">30-DAY TOTAL</span>
      <SkeletonBlock v-if="pending" height="120px" />
      <StatList v-else-if="totals.length" :items="totals" />
      <p v-else-if="!hasError" class="sessions-empty">
        No session data synced yet.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropertySessions } from "#shared/types/overviewSessions";
import {
  buildSessionsAriaLabel,
  buildSessionsAxisLabels,
  buildSessionsChartSeries,
  buildSessionsTotals,
} from "~/utils/overviewSessions";

// The "/" per-property sessions chart plus its 30-day totals list, drawn
// from GET /api/overview/sessions (see useOverviewSessions).
const props = defineProps<{
  properties: PropertySessions[];
  pending: boolean;
  hasError: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

const chartSeries = computed(() => buildSessionsChartSeries(props.properties));
const axisLabels = computed(() => buildSessionsAxisLabels(props.properties));
const ariaLabel = computed(() => buildSessionsAriaLabel(props.properties));
const totals = computed(() => buildSessionsTotals(props.properties));
</script>

<style scoped>
.sessions-panel {
  padding: 20px 24px 18px;
  display: flex;
  gap: 28px;
}
.sessions-chart {
  flex-grow: 1;
  min-width: 0;
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
  letter-spacing: 0.02em;
}
.panel-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
.totals {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 4px;
}
.sessions-empty {
  margin: 0;
  font-size: 11px;
  color: var(--ink-3);
}
.totals-label {
  padding-bottom: 3px;
}
.totals :deep(.label),
.totals :deep(.value) {
  font-size: 12px;
}
</style>
