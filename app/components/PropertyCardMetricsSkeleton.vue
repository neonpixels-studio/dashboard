<template>
  <div class="metrics-skeleton">
    <ul class="stats-skeleton">
      <li v-for="index in STAT_COUNT" :key="index" class="stat-skeleton">
        <SkeletonBlock width="36px" height="8px" />
        <SkeletonBlock width="44px" height="18px" />
      </li>
    </ul>
    <span class="grow"></span>
    <SkeletonBlock
      :width="`${SPARKLINE_WIDTH}px`"
      :height="`${SPARKLINE_HEIGHT}px`"
      radius="var(--r-xs)"
      class="sparkline-skeleton"
    />
  </div>
</template>

<script setup lang="ts">
import {
  PROPERTY_CARD_SPARKLINE_HEIGHT as SPARKLINE_HEIGHT,
  PROPERTY_CARD_SPARKLINE_WIDTH as SPARKLINE_WIDTH,
  PROPERTY_CARD_STAT_COUNT as STAT_COUNT,
} from "~/utils/appViewModel";

// Placeholder for PropertyCard's metrics area (stats row), shown whenever
// its `card` prop is `null` and the fetch is still pending. The trailing
// block reserves the same footprint (shared constants, so it can't drift)
// as the real SparkLine PropertyCardMetrics.vue draws once
// `card.sparklines` loads, so the row doesn't reflow when data arrives. The
// status chip and integration chips get their own inline `SkeletonBlock` in
// PropertyCard.vue since they don't share this row's layout.
</script>

<style scoped>
.metrics-skeleton {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-top: auto;
}
.stats-skeleton {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: 16px;
}
.stat-skeleton {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
</style>
