<template>
  <DataErrorState
    v-if="error"
    message="Couldn't load live data for this property."
    :last-synced-at="lastSyncedAt"
    @retry="refresh"
  />

  <template v-else-if="pending">
    <slot name="pending" />
  </template>

  <template v-else>
    <slot />
  </template>
</template>

<script setup lang="ts">
// The three detail templates (AppDetailProduct/Writing/Marketing, issue #20)
// all gate their entire body on the same three useApp() states — this is
// the one place that branching lives, rather than each template repeating
// its own copy (fallow's duplication gate flagged the repeated block before
// this existed). Each template still owns its own `#pending` skeleton
// (shapes differ per layout) and its own loaded content via the default
// slot.
defineProps<{
  pending: boolean;
  error: unknown;
  lastSyncedAt: string | null;
  refresh: () => Promise<void>;
}>();
</script>
