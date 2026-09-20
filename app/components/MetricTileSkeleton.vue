<template>
  <div class="card tile-skeleton">
    <SkeletonBlock width="70px" height="10px" />
    <div class="value-row">
      <SkeletonBlock width="90px" height="34px" />
    </div>
    <SkeletonBlock width="120px" height="10px" />
  </div>
</template>

<script setup lang="ts">
// Placeholder shaped like MetricTile.vue / the "/" rollup tiles, shown while
// `useOverview`/`useApp` is pending or has no data yet. Reusable as-is by the
// wiring issues (#18 rollups, #20 detail tiles) — nothing here is specific to
// one metric.
</script>

<style scoped>
.tile-skeleton {
  padding: 17px 19px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.value-row {
  padding: 4px 0;
}
</style>
