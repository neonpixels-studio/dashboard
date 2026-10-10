<template>
  <section id="alerts" class="card alerts-panel" aria-labelledby="alerts-title">
    <div class="panel-head">
      <AppIcon name="triangle" :size="12" :stroke-width="1.5" />
      <h2 id="alerts-title" class="panel-title">ALERTS</h2>
      <span v-if="alerts.length" class="panel-count">{{ alerts.length }}</span>
    </div>

    <SkeletonBlock v-if="pending" height="40px" />
    <DataErrorState
      v-else-if="hasError"
      message="Couldn't load alerts."
      @retry="emit('retry')"
    />
    <p v-else-if="!alerts.length" class="alerts-clear">
      All clear. No sync failures or stale vendors.
    </p>
    <ul v-else class="alert-list">
      <li v-for="alert in alerts" :key="alert.id" class="alert-row">
        <span class="alert-property">{{ nameFor(alert.slug) }}</span>
        <span class="alert-source">{{ alert.source }}</span>
        <span class="alert-message">{{ alert.message }}</span>
        <time
          v-if="alert.occurredAt"
          class="alert-time"
          :datetime="alert.occurredAt"
        >
          {{ formatAlertTime(alert.occurredAt) }}
        </time>
        <NuxtLink :to="alert.href" class="alert-link">View</NuxtLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { findRollupSourceBySlug } from "~/config/apps";
import { formatAlertTime } from "~/utils/alertFormat";
import type { OverviewAlert } from "#shared/types/alerts";

// The "/" overview Alerts panel (and the top nav's #alerts target). Renders
// whatever source-agnostic OverviewAlert[] GET /api/overview/alerts returns,
// so new alert sources never touch this component.
defineProps<{
  alerts: OverviewAlert[];
  pending: boolean;
  hasError: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

function nameFor(slug: string): string {
  return findRollupSourceBySlug(slug)?.name ?? slug;
}
</script>

<style scoped>
.alerts-panel {
  padding: 14px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-3);
}
.panel-title {
  margin: 0;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
}
.panel-count {
  font-size: 10px;
  color: var(--err);
}
.alerts-clear {
  margin: 0;
  font-size: 11px;
  color: var(--ink-3);
}
.alert-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.alert-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 8px 0;
  font-size: 12px;
  border-top: 1px solid var(--line);
}
.alert-row:first-child {
  border-top: 0;
}
.alert-property {
  font-weight: 600;
}
.alert-source {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.alert-message {
  flex-grow: 1;
  min-width: 0;
  color: var(--err);
  overflow-wrap: anywhere;
}
.alert-time {
  font-size: 10px;
  color: var(--ink-3);
  white-space: nowrap;
}
.alert-link {
  font-size: 11px;
  color: var(--ink-2);
}
.alert-link:hover {
  color: var(--ink);
}
</style>
