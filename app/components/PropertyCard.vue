<template>
  <NuxtLink
    :to="`/apps/${app.slug}`"
    class="card prop-card"
    :style="{ borderTopColor: app.accent }"
    :aria-busy="!app.card"
  >
    <div class="head-row">
      <span
        v-if="app.card"
        class="status-chip"
        :style="healthToneChipStyle(app.card.status.tone)"
      >
        {{ app.card.status.label }}
      </span>
      <SkeletonBlock v-else width="52px" height="16px" radius="var(--r-xs)" />
      <span class="category">{{ app.order }} — {{ app.category }}</span>
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5.5 10.5 10.5 5.5M6.4 5.5h4.1v4.1"
          stroke="#82828F"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <div class="name display-num">
      {{ app.nameBase
      }}<span :style="{ color: app.accent }">{{ app.nameTld }}</span>
    </div>

    <p class="description">{{ app.description }}</p>

    <!-- @todo #19: curate which metrics render (MRR/USERS/ISSUES, per-metric
         tone) and draw a real sparkline path from app.card.sparklines. This
         generic list/label render is a placeholder, not the final design. -->
    <PropertyCardMetricsSkeleton v-if="!app.card" />
    <div v-else class="stats-row">
      <ul class="stats">
        <li
          v-for="metric in visibleMetrics"
          :key="`${metric.metric}-${metric.period}`"
          class="stat"
        >
          <span class="micro-label">{{ metric.metric }}</span>
          <span class="stat-value">{{ metric.value }}</span>
        </li>
      </ul>
      <span class="grow"></span>
    </div>

    <ul v-if="app.card" class="chips">
      <li
        v-for="integration in app.card.integrations"
        :key="integration.vendor"
        class="chip-tag"
        :class="integrationHealthTone(integration)"
      >
        {{ integration.vendor }}
      </li>
    </ul>
  </NuxtLink>
</template>

<script setup lang="ts">
import {
  PROPERTY_CARD_STAT_COUNT,
  type AppCardViewModel,
} from "~/utils/appViewModel";
import {
  healthToneChipStyle,
  integrationHealthTone,
} from "~/utils/statusColor";

const props = defineProps<{ app: AppCardViewModel }>();

// Bounded to the same count PropertyCardMetricsSkeleton reserves space for —
// `AppCard.metrics` is a generic, unbounded list, but the card's fixed
// height and non-wrapping stats row aren't.
const visibleMetrics = computed(
  () => props.app.card?.metrics.slice(0, PROPERTY_CARD_STAT_COUNT) ?? [],
);
</script>

<style scoped>
.prop-card {
  height: 262px;
  padding: 17px 19px 16px;
  border-top: 2px solid;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.head-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.status-chip {
  padding: 2px 7px;
  border-radius: var(--r-xs);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.category {
  flex-grow: 1;
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}
.name {
  font-size: 28px;
  letter-spacing: -0.035em;
}
.description {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ink-2);
}
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
.chips {
  margin: 0;
  padding: 11px 0 0;
  list-style: none;
  display: flex;
  gap: 5px;
  border-top: 1px solid var(--line-3);
}
.chip-tag {
  padding: 2px 6px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-xs);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-2);
}
.chip-tag.danger {
  border-color: color-mix(in srgb, var(--err) 25%, transparent);
  color: var(--err);
}
.chip-tag.warn {
  border-color: color-mix(in srgb, var(--warn) 25%, transparent);
  color: var(--warn);
}
.chip-tag.muted {
  border-style: dashed;
  color: var(--ink-3);
}
</style>
