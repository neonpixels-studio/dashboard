<template>
  <div class="card traffic-panel">
    <div class="traffic-chart">
      <div class="traffic-head">
        <ul class="headline-stats">
          <li v-for="stat in stats" :key="stat.label">
            <span class="metric-label">{{ stat.label }}</span>
            <span class="display-num headline-value">{{ stat.value }}</span>
          </li>
        </ul>
        <span class="grow"></span>
        <span class="delta ok">{{ delta }}</span>
      </div>
      <SparkLine
        :path="path"
        width="100%"
        :height="150"
        view-box="0 0 860 150"
        :color="app.accent"
        :stroke-width="2.4"
        filled
        :fill-color="`color-mix(in srgb, ${app.accent} 9%, transparent)`"
        :grid-lines="[14, 55, 96, 149]"
        :aria-label="`${app.name} daily sessions over the last 30 days`"
      />
      <AxisRow />
    </div>

    <div v-for="list in lists" :key="list.title" class="traffic-list">
      <span class="metric-label">{{ list.title }}</span>
      <StatList :items="list.items" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DashboardApp } from "~/config/apps";

defineProps<{
  app: DashboardApp;
  stats: { label: string; value: string }[];
  delta: string;
  path: string;
  lists: { title: string; items: { label: string; value: string }[] }[];
}>();
</script>

<style scoped>
.traffic-panel {
  padding: 20px 24px;
  display: flex;
  gap: 24px;
}
.traffic-chart {
  flex: 3;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.traffic-head {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}
.headline-stats {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: 16px;
}
.headline-stats li {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.headline-value {
  font-size: 26px;
}
.traffic-list {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
</style>
