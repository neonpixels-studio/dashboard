<template>
  <DataErrorState
    v-if="error"
    message="Couldn't load live data for this property."
    :last-synced-at="lastSyncedAt"
    @retry="refresh"
  />

  <div v-else class="detail-body">
    <template v-if="pending && !hasData">
      <slot name="pending" />
    </template>

    <template v-else>
      <ul v-if="alerts.length" class="alerts-list">
        <li v-for="alert in alerts" :key="`${alert.vendor}-${alert.slug}`">
          <AppAlert
            tone="err"
            :title="`${alert.vendor.toUpperCase()} sync failing`"
          >
            {{ alert.message }}
          </AppAlert>
        </li>
      </ul>

      <slot />
    </template>
  </div>
</template>

<script setup lang="ts">
// The three detail templates (AppDetailProduct/Writing/Marketing, issue #20)
// all gate their entire body on the same useApp() states, share the same
// `.detail-body` wrapper, and show the same real sync-failure alerts — this
// is the one place all three live, rather than each template repeating its
// own copy (fallow's duplication gate flagged the repeated block, and
// alerts had only ever been wired into AppDetailProduct). Each template
// still owns its own `#pending` skeleton (shapes differ per layout) and its
// own loaded content via the default slot.
//
// `pending && !hasData` (not `pending` alone): once the page has already
// loaded once, a background refresh (e.g. the error state's own retry)
// re-sets `pending` without clearing `detail` — swapping back to skeletons
// would hide real, still-valid content behind a loading flash for no
// reason. `hasData` lets a caller say "I already have something to show".
import type { AppAlert } from "#shared/types/dashboard";

withDefaults(
  defineProps<{
    pending: boolean;
    error: unknown;
    lastSyncedAt: string | null;
    refresh: () => Promise<void>;
    alerts?: AppAlert[];
    hasData?: boolean;
  }>(),
  { alerts: () => [], hasData: false },
);
</script>

<style scoped>
.detail-body {
  flex-grow: 1;
  padding: 24px 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.alerts-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
