<template>
  <ul v-if="panel.alerts.length" class="database-alerts">
    <li v-for="alert in panel.alerts" :key="alert.id" class="database-alert">
      <AppIcon name="triangle" :size="12" :stroke-width="1.5" />
      <span>{{ alert.message }}</span>
    </li>
  </ul>

  <div class="meters">
    <BarMeter
      label="COMPUTE"
      :value="view.computeValue"
      :pct="view.computePct"
      :pct-label="view.computeShareLabel"
      :color="view.computeColor"
    />
    <p class="projection">
      <span class="stat-label">PROJECTED BY END OF PERIOD</span>
      <span class="stat-value">{{ view.projectionLabel }}</span>
    </p>
    <BarMeter
      label="STORAGE"
      :value="view.storageValue"
      :pct="view.storagePct"
      :pct-label="view.storageShareLabel"
      :color="view.storageColor"
    />
  </div>

  <p class="transfer">
    <span class="stat-label">DATA TRANSFER THIS PERIOD</span>
    <span class="stat-value">{{ view.transferLabel }}</span>
  </p>

  <div class="branches">
    <h3 class="stat-label">BRANCHES</h3>
    <ul class="branch-list">
      <li v-for="branch in view.branches" :key="branch.name" class="branch-row">
        <span class="branch-name">{{ branch.name }}</span>
        <time
          v-if="branch.dateLabel"
          class="branch-date"
          :datetime="branch.createdAt ?? undefined"
          >{{ branch.dateLabel }}</time
        >
      </li>
    </ul>
  </div>

  <p v-if="view.syncedLabel" class="synced">
    <span class="stat-label">SYNCED</span>
    <time :datetime="panel.capturedAt">{{ view.syncedLabel }}</time>
  </p>
</template>

<script setup lang="ts">
import type { DatabasePanel } from "#shared/types/database";
import { toDatabasePanelView } from "~/utils/databasePanel";

// The loaded half of DatabasePanel: alerts, meters, transfer and branches.
// Everything shown (projection, alerts) is computed server-side.
const props = defineProps<{ panel: DatabasePanel }>();

const view = computed(() => toDatabasePanelView(props.panel));
</script>

<style scoped>
.database-alerts {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.database-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--err);
}
.meters {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.projection,
.transfer,
.synced {
  margin: 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}
.stat-label {
  margin: 0;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
.stat-value {
  font-variant-numeric: tabular-nums;
}
.branch-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.branch-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 12px;
  border-top: 1px solid var(--line);
}
.branch-row:first-child {
  border-top: 0;
}
.branch-date {
  color: var(--ink-3);
}
</style>
