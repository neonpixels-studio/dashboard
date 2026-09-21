<template>
  <svg
    class="multi-chart"
    width="100%"
    :height="200"
    viewBox="0 0 900 200"
    preserveAspectRatio="none"
    role="img"
    :aria-label="ariaLabel"
  >
    <line
      x1="0"
      y1="14"
      x2="900"
      y2="14"
      stroke="var(--line-3)"
      stroke-width="1"
    />
    <line
      x1="0"
      y1="60.5"
      x2="900"
      y2="60.5"
      stroke="var(--line-3)"
      stroke-width="1"
    />
    <line
      x1="0"
      y1="107"
      x2="900"
      y2="107"
      stroke="var(--line-3)"
      stroke-width="1"
    />
    <line
      x1="0"
      y1="153.5"
      x2="900"
      y2="153.5"
      stroke="var(--line-3)"
      stroke-width="1"
    />
    <line
      x1="0"
      y1="199"
      x2="900"
      y2="199"
      stroke="var(--line)"
      stroke-width="1"
    />
    <path
      v-for="line in series"
      :key="line.slug"
      :d="line.path"
      fill="none"
      :stroke="line.color"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle
      v-for="point in series"
      :key="`dot-${point.slug}`"
      cx="900"
      :cy="point.endY"
      r="3.5"
      :fill="point.color"
      stroke="var(--surface)"
      stroke-width="2"
    />
  </svg>
</template>

<script setup lang="ts">
// `ariaLabel` defaults to the overview page's original multi-property
// description (its only caller until issue #20) so that usage stays
// unchanged; the single-property detail page passes its own description —
// the default text is specifically wrong ("five properties", a named
// property "rose fastest") for a chart drawing just one app's own trend.
const DEFAULT_ARIA_LABEL =
  "Daily sessions for five properties over 30 days. danholloran.me rose fastest; grimicorn.dev stayed flat.";

withDefaults(
  defineProps<{
    series: { slug: string; color: string; path: string; endY: number }[];
    ariaLabel?: string;
  }>(),
  { ariaLabel: DEFAULT_ARIA_LABEL },
);
</script>

<style scoped>
.multi-chart {
  display: block;
}
</style>
