<template>
  <div id="alerts" class="card rollup-tile issues-tile">
    <div class="issues-head">
      <AppIcon name="triangle" :size="12" :stroke-width="1.5" />
      <span class="issues-label">OPEN ISSUES</span>
    </div>
    <RollupValueRow :value-label="valueLabel" :delta-label="deltaLabel" />
    <StatList
      v-if="items.length"
      class="rollup-list"
      :divided="false"
      :items="items"
    />
    <p v-else class="rollup-empty">{{ emptyMessage }}</p>
  </div>
</template>

<script setup lang="ts">
// The "/" rollup grid's OPEN ISSUES tile — split out of index.vue (issue
// #18). Deliberately never gets the ok/growth delta tone RollupStatTile
// supports: more issues is never the "good" direction to celebrate in
// green, so the delta here is always muted, same as the original static
// mock. No severity chips — metric_snapshot has no severity column yet, and
// the Sentry provider that would populate one is #16 (see this PR's
// follow-up suggestions).
import type { StatListItem } from "./StatList.vue";

defineProps<{
  valueLabel: string;
  deltaLabel: string | null;
  items: StatListItem[];
  emptyMessage: string;
}>();
</script>

<style scoped>
.issues-tile {
  border-color: color-mix(in srgb, var(--err) 25%, transparent);
}
.issues-head {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--err);
}
.issues-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
}
</style>
