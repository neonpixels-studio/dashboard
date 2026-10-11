<template>
  <section
    id="database"
    class="card database-panel"
    aria-labelledby="database-title"
  >
    <div class="panel-head">
      <h2 id="database-title" class="panel-title">DATABASE</h2>
      <span class="panel-meta">NEON · FREE PLAN</span>
      <span v-if="alertCount" class="panel-count">{{ alertCount }}</span>
    </div>

    <SkeletonBlock v-if="pending && !panel" height="120px" />
    <DataErrorState
      v-else-if="hasError"
      message="Couldn't load database usage."
      @retry="emit('retry')"
    />
    <p v-else-if="!panel" class="database-empty">No Neon usage synced yet.</p>
    <DatabasePanelBody v-else :panel="panel" />
  </section>
</template>

<script setup lang="ts">
import type { DatabasePanel as DatabasePanelData } from "#shared/types/database";

// The Neon DATABASE panel: on the property detail page for every property
// with a database, and on the overview for the dashboard's own project. This
// shell owns the loading / error / empty states; DatabasePanelBody the data.
const props = defineProps<{
  panel: DatabasePanelData | null;
  pending: boolean;
  hasError: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

const alertCount = computed(() =>
  props.hasError ? 0 : (props.panel?.alerts.length ?? 0),
);
</script>

<style scoped>
.database-panel {
  padding: 14px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-3);
}
.panel-title {
  margin: 0;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
}
.panel-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
}
.panel-count {
  font-size: 10px;
  color: var(--err);
}
.database-empty {
  margin: 0;
  font-size: 11px;
  color: var(--ink-3);
}
</style>
