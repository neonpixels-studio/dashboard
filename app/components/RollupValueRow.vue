<template>
  <div class="value-row">
    <span class="display-num rollup-value">{{ valueLabel }}</span>
    <span v-if="deltaLabel" class="delta" :class="deltaTone">
      {{ deltaLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
// The headline value + delta pairing shared by all three "/" rollup tiles
// (RollupMrrTile, RollupStatTile, RollupIssuesTile) — pulled out once it hit
// three identical copies of the same markup.
withDefaults(
  defineProps<{
    valueLabel: string;
    deltaLabel: string | null;
    deltaTone?: "ok" | "muted";
  }>(),
  { deltaTone: "muted" },
);
</script>
