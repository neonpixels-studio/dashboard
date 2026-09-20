<template>
  <div class="metrics-skeleton">
    <ul class="stats-skeleton">
      <li v-for="index in STAT_COUNT" :key="index" class="stat-skeleton">
        <SkeletonBlock width="36px" height="8px" />
        <SkeletonBlock width="44px" height="18px" />
      </li>
    </ul>
    <span class="grow"></span>
  </div>
</template>

<script setup lang="ts">
import { PROPERTY_CARD_STAT_COUNT as STAT_COUNT } from "~/utils/appViewModel";

// Placeholder for PropertyCard's metrics area (stats row), shown whenever
// its `card` prop is `null` — i.e. `GET /api/apps` hasn't resolved yet, or
// (until issue #19 wires the grid to `useApps`) always. Deliberately has no
// sparkline placeholder: PropertyCard.vue doesn't render a sparkline once
// `card` is populated either (issue #19's job), so reserving space for one
// here would promise content the loaded state doesn't deliver. The status
// chip and integration chips get their own inline `SkeletonBlock` in
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
