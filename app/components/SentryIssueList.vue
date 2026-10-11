<template>
  <ul class="issues">
    <li v-for="issue in rows" :key="issue.id" class="issue">
      <a
        class="issue-link"
        :href="issue.permalink"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="issue-head">
          <span
            class="level-chip"
            :style="{
              color: issue.levelColor,
              background: `color-mix(in srgb, ${issue.levelColor} 15%, transparent)`,
            }"
          >
            {{ issue.levelLabel }}
          </span>
          <span class="issue-title">{{ issue.title }}</span>
          <span class="visually-hidden"> (opens in Sentry)</span>
        </span>
        <span class="issue-meta">
          <span v-if="issue.location">{{ issue.location }}</span>
          <span v-if="issue.location" aria-hidden="true">·</span>
          <span>{{ issue.eventsLabel }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ issue.usersLabel }}</span>
          <span class="grow"></span>
          <time :datetime="issue.lastSeen">{{
            lastSeenLabel(issue.lastSeen)
          }}</time>
        </span>
      </a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { formatRelativeTime } from "~/utils/relativeTime";
import type { SentryIssueRowView } from "~/utils/sentryPanel";

defineProps<{ rows: SentryIssueRowView[] }>();

// "12m ago" depends on the wall clock, so SSR and hydration would disagree
// near a minute boundary; show it only once mounted (same approach as
// DataErrorState).
const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});
function lastSeenLabel(lastSeen: string): string {
  return isMounted.value ? formatRelativeTime(lastSeen) : "";
}
</script>

<style scoped>
.issues {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line-3);
}
.issue:not(:last-child) {
  border-bottom: 1px solid var(--line-3);
}
.issue-link {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 0;
  color: inherit;
  text-decoration: none;
}
.issue-link:hover .issue-title,
.issue-link:focus-visible .issue-title {
  text-decoration: underline;
}
.issue-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.issue-title {
  flex-grow: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 500;
}
.issue-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--ink-3);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
