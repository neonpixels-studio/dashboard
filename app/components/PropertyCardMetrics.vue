<template>
  <!-- Card data wins whenever it exists, even if `hasError` is also true (a
       later refresh failed after an earlier load succeeded) — stale real
       data beats an error message, same as DataErrorState's own "showing
       the last known state" behavior for the overview rollups. -->
  <PropertyCardMetricsSkeleton v-if="isLoading" />
  <!-- No retry affordance here (unlike DataErrorState): the whole card is
       itself a NuxtLink, and a nested <button> inside an <a> is invalid
       HTML content model (interactive-in-interactive) — reloading the page
       is the only recourse for a per-card fetch failure today. -->
  <div v-else-if="hasError && !card" class="stats-row card-error-row">
    <AppIcon name="triangle" :size="12" :stroke-width="1.5" />
    <span class="error-message">Couldn't load live data.</span>
  </div>
  <div v-else class="stats-row">
    <ul class="stats">
      <li
        v-for="metric in visibleMetrics"
        :key="`${metric.metric}-${metric.period}`"
        class="stat"
      >
        <span class="micro-label">{{ metricLabel(metric.metric) }}</span>
        <span class="stat-value" :style="{ color: statColor(metric) }">
          {{ formatMetricValue(metric) }}
        </span>
      </li>
    </ul>
    <span class="grow"></span>
    <SparkLine
      v-if="hasSparkline"
      :path="sparklinePath"
      :width="SPARKLINE_WIDTH"
      :height="SPARKLINE_HEIGHT"
      :view-box="SPARKLINE_VIEW_BOX"
      :color="accent"
      :aria-label="`${appName} trend over the last synced period`"
    />
  </div>
</template>

<script setup lang="ts">
// The stats/sparkline half of PropertyCard.vue's metrics area, split out so
// the parent's template stays under fallow's per-template complexity
// budget — this row's own loading/error/loaded branching, curation, and
// sparkline derivation all live here instead of inline in PropertyCard.
import {
  formatMetricValue,
  metricLabel,
  metricTone,
  selectCardStats,
  selectSparklineSeries,
} from "~/utils/propertyCardMetrics";
import { buildSparklinePath } from "~/utils/sparklinePath";
import { healthToneColor } from "~/utils/statusColor";
import type { AppCard, CurrentMetric } from "#shared/types/dashboard";

const props = defineProps<{
  card: AppCard | null;
  // See PropertyCard.vue's own `hasError` prop doc — same "stale data wins"
  // contract applies here.
  hasError?: boolean;
  accent: string;
  appName: string;
}>();

// Sized to match the card's original design (see PropertyCard.vue's git
// history pre-view-model-seam refactor): small enough to sit beside three
// stat columns inside the fixed 262px-tall card.
const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 34;
const SPARKLINE_VIEW_BOX = `0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`;
// A single point has no trend to draw — same reasoning as the "/" MRR
// rollup sparkline (app/pages/index.vue's MIN_SPARKLINE_POINTS).
const MIN_SPARKLINE_POINTS = 2;

const isLoading = computed(() => !props.card && !props.hasError);

// Bounded to the same count PropertyCardMetricsSkeleton reserves space for
// — `AppCard.metrics` is a generic, unbounded list, but the card's fixed
// height and non-wrapping stats row aren't. See app/utils/
// propertyCardMetrics.ts for how the three slots are chosen.
const visibleMetrics = computed(() =>
  selectCardStats(props.card?.metrics ?? []),
);

function statColor(metric: CurrentMetric): string {
  const tone = metricTone(metric);
  return tone ? healthToneColor(tone) : "var(--ink)";
}

const sparklineSeries = computed(() =>
  selectSparklineSeries(props.card?.sparklines ?? [], visibleMetrics.value[0]),
);

const hasSparkline = computed(
  () => (sparklineSeries.value?.points.length ?? 0) >= MIN_SPARKLINE_POINTS,
);

const sparklinePath = computed(() =>
  buildSparklinePath(
    sparklineSeries.value?.points ?? [],
    SPARKLINE_WIDTH,
    SPARKLINE_HEIGHT,
  ),
);
</script>

<style scoped>
.stats-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-top: auto;
}
.stats {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: 16px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stat-value {
  font-family: var(--display);
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.02em;
  line-height: 1;
}
.card-error-row {
  align-items: center;
  gap: 7px;
  color: var(--err);
}
.error-message {
  font-size: 11px;
  font-weight: 600;
}
</style>
