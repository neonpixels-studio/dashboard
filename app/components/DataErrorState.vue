<template>
  <div class="card data-error" role="alert">
    <div class="head-row">
      <AppIcon name="triangle" :size="12" :stroke-width="1.5" />
      <span class="message">{{ message }}</span>
      <span class="grow"></span>
      <button type="button" class="retry-btn" @click="emit('retry')">
        Retry
      </button>
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
// `@retry` lets a caller wire the composable's own `refresh` back in.
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

const emit = defineEmits<{ retry: [] }>();

// The exact "Xm/Xh ago" text depends on wall-clock time, which differs
// between the server render and the client mount — rendering it directly in
// a computed would produce a hydration mismatch. Instead SSR and the initial
// client render both show the mount-independent message below; the watcher
// (started inside onMounted, so it never runs during SSR or the hydration
// pass itself) fills in the precise relative time and keeps it in sync with
// `lastSyncedAt` — important because `@retry` is expected to call the
// composable's `refresh`, which can update `lastSyncedAt` while this
// component stays mounted.
const relativeSync = ref<string | null>(null);
onMounted(() => {
  watch(
    () => props.lastSyncedAt,
    (lastSyncedAt) => {
      relativeSync.value = lastSyncedAt
        ? formatRelativeTime(lastSyncedAt)
        : null;
    },
    { immediate: true },
  );
});

const syncNote = computed(() => {
  if (!props.lastSyncedAt) {
    return "No data has synced yet.";
  }
  if (!relativeSync.value) {
    return "Showing the last known state.";
  }
  return `Showing the last known state — synced ${relativeSync.value}.`;
});
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
.retry-btn {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--err) 35%, transparent);
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--err);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}
.sync-note {
  margin: 0;
  font-size: 10px;
  color: var(--ink-3);
}
</style>
