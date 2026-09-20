<template>
  <div class="card data-error" role="alert">
    <div class="head-row">
      <AppIcon name="triangle" :size="12" :stroke-width="1.5" />
      <span class="message">{{ message }}</span>
    </div>
    <p class="sync-note">{{ syncNote }}</p>
  </div>
</template>

<script setup lang="ts">
import { formatRelativeTime } from "~/utils/relativeTime";

// Reusable error affordance for the wiring issues (#18/#19/#20): when a
// composable's `error` is set, widgets show this instead of the real
// content — never a zero standing in for missing data. `lastSyncedAt` comes
// straight through from the response's own `lastSyncedAt` field so the note
// stays honest even if the fetch that would have refreshed it just failed.
const DEFAULT_MESSAGE = "Couldn't load live data.";

const props = withDefaults(
  defineProps<{
    message?: string;
    lastSyncedAt?: string | null;
  }>(),
  {
    message: DEFAULT_MESSAGE,
    lastSyncedAt: null,
  },
);

const syncNote = computed(
  () =>
    `Showing the last known state — synced ${formatRelativeTime(props.lastSyncedAt)}.`,
);
</script>

<style scoped>
.data-error {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-color: color-mix(in srgb, var(--err) 25%, transparent);
}
.head-row {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--err);
}
.message {
  font-size: 11px;
  font-weight: 600;
}
.sync-note {
  margin: 0;
  font-size: 10px;
  color: var(--ink-3);
}
</style>
