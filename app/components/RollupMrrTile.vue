<template>
  <div class="card rollup-tile">
    <span class="metric-label">MRR · ALL APPS</span>
    <RollupValueRow
      :value-label="valueLabel"
      :delta-label="deltaLabel"
      :delta-tone="deltaTone"
    />
    <SparkLine
      v-if="hasSparkline"
      class="rollup-spark"
      :path="sparklinePath"
      width="100%"
      :height="46"
      view-box="0 0 320 72"
      color="var(--ink)"
      :stroke-width="2.6"
      filled
      fill-color="color-mix(in srgb, #f2f2f5 8%, transparent)"
      aria-label="Monthly recurring revenue across all apps over the last 30 days"
    />
    <p v-else class="rollup-empty">
      Not enough synced data for a trend line yet.
    </p>
  </div>
</template>

<script setup lang="ts">
// The "/" rollup grid's MRR tile — split out of index.vue (issue #18) purely
// to keep that page's template small; every value here is a plain prop, no
// data fetching or shaping happens in this component.
defineProps<{
  valueLabel: string;
  deltaLabel: string | null;
  deltaTone: "ok" | "muted";
  hasSparkline: boolean;
  sparklinePath: string;
}>();
</script>
