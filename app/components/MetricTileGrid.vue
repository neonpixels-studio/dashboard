<template>
  <div class="tile-grid">
    <template v-if="pending">
      <MetricTileSkeleton v-for="index in tileCount" :key="index" />
    </template>
    <MetricTile
      v-for="(tile, index) in tiles"
      v-else
      :key="index"
      :label="tile.label"
      :value="tile.value"
      :delta="tile.delta"
      :delta-tone="tile.deltaTone"
      :sub="tile.sub"
      :tone="tile.tone"
    />
  </div>
</template>

<script setup lang="ts">
// The 4-tile grid every detail template (issue #20) renders, loaded or
// skeleton — factored out once it was the same markup repeated identically
// across AppDetailProduct/Writing/Marketing (fallow's duplication gate
// flagged it). `tileCount` only matters while `pending` (the skeleton has
// no real tiles to measure its own length from).
import type { MetricTileData } from "~/utils/metricTile";

withDefaults(
  defineProps<{
    tiles: MetricTileData[];
    pending?: boolean;
    tileCount?: number;
  }>(),
  { pending: false, tileCount: 4 },
);
</script>

<style scoped>
.tile-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
</style>
