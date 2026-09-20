<template>
  <div class="card rollup-tile">
    <span class="metric-label">{{ label }}</span>
    <RollupValueRow
      :value-label="valueLabel"
      :delta-label="deltaLabel"
      :delta-tone="deltaTone"
    />
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
// Shared by the "/" rollup grid's ACTIVE SUBSCRIBERS and SESSIONS tiles
// (issue #18) — both are "value + delta + StatList" with no other
// differences, so they share one presentational component instead of two
// near-identical templates. OPEN ISSUES looks similar but has its own icon
// header and fixed muted delta tone, so it stays as RollupIssuesTile
// instead of a third near-miss usage of this one.
import type { StatListItem } from "./StatList.vue";

defineProps<{
  label: string;
  valueLabel: string;
  deltaLabel: string | null;
  deltaTone: "ok" | "muted";
  items: StatListItem[];
  emptyMessage: string;
}>();
</script>
