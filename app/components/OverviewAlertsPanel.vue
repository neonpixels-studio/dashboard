<template>
  <section id="alerts" class="card alerts-panel" aria-labelledby="alerts-title">
    <div class="panel-head">
      <AppIcon name="triangle" :size="12" :stroke-width="1.5" />
      <h2 id="alerts-title" class="panel-title">ALERTS</h2>
      <span v-if="showCount" class="panel-count">{{ alerts.length }}</span>
    </div>

    <SkeletonBlock v-if="pending && !alerts.length" height="40px" />
    <DataErrorState
      v-else-if="hasError"
      message="Couldn't load alerts."
      @retry="emit('retry')"
    />
    <p v-else-if="!alerts.length" class="alerts-clear">
      All clear. No sync failures or stale vendors.
    </p>
    <ul v-else class="alert-list">
      <OverviewAlertRow
        v-for="alert in alerts"
        :key="alert.id"
        :alert="alert"
      />
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { OverviewAlert } from "#shared/types/alerts";

// The "/" overview Alerts panel (and the top nav's #alerts target). Renders
// whatever source-agnostic OverviewAlert[] GET /api/overview/alerts returns,
// so new alert sources never touch this component.
const props = defineProps<{
  alerts: OverviewAlert[];
  pending: boolean;
  hasError: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

const showCount = computed(() => props.alerts.length > 0 && !props.hasError);
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
</style>
