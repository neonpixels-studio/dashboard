<template>
  <li class="alert-row">
    <span class="alert-property">{{ nameFor(alert.slug) }}</span>
    <span class="alert-source">{{ alert.source }}</span>
    <span class="alert-message">{{ alert.message }}</span>
    <time
      v-if="timeLabel"
      class="alert-time"
      :datetime="alert.occurredAt ?? undefined"
    >
      {{ timeLabel }}
    </time>
    <NuxtLink
      :to="alert.href"
      class="alert-link"
      :aria-label="`View ${nameFor(alert.slug)} ${alert.source} alert`"
      >View</NuxtLink
    >
  </li>
</template>

<script setup lang="ts">
import { findRollupSourceBySlug } from "~/config/apps";
import { formatAlertTime } from "~/utils/alertFormat";
import type { OverviewAlert } from "#shared/types/alerts";

const props = defineProps<{ alert: OverviewAlert }>();

// Null for an unparseable timestamp, so no empty <time> is rendered.
const timeLabel = computed(() => formatAlertTime(props.alert.occurredAt));

function nameFor(slug: string): string {
  return findRollupSourceBySlug(slug)?.name ?? slug;
}
</script>

<style scoped>
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
