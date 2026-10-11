<template>
  <div class="events-trend">
    <div class="events-trend-head">
      <span class="metric-label">EVENTS · 14 DAYS</span>
      <span class="trend-value">{{ total }}</span>
      <span class="trend-scope">TOP ISSUES</span>
    </div>
    <SparkLine
      :path="path"
      width="100%"
      :height="60"
      :view-box="`0 0 ${SENTRY_TREND_VIEWBOX_WIDTH} ${SENTRY_TREND_VIEWBOX_HEIGHT}`"
      color="var(--warn)"
      :aria-label="chartLabel"
    />
  </div>
</template>

<script setup lang="ts">
import {
  SENTRY_TREND_VIEWBOX_HEIGHT,
  SENTRY_TREND_VIEWBOX_WIDTH,
} from "~/utils/sentryPanel";

defineProps<{ path: string; total: string; chartLabel: string }>();
</script>

<style scoped>
.events-trend {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.events-trend-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
}
.trend-value {
  font-size: 11px;
  font-weight: 600;
}
.trend-scope {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
</style>
