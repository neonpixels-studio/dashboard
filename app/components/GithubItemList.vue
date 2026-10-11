<template>
  <p v-if="!items.length" class="empty">No open issues or pull requests.</p>
  <ul v-else class="item-list">
    <li v-for="row in rows" :key="row.key" class="item">
      <span class="badge" :class="row.badgeTone">{{ row.kindLabel }}</span>
      <a
        class="item-link"
        :href="row.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="item-ref">{{ row.reference }}</span>
        <span class="item-title">{{ row.title }}</span>
      </a>
      <ul v-if="row.labels.length" class="chip-row labels">
        <li v-for="label in row.labels" :key="label" class="chip">
          {{ label }}
        </li>
      </ul>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { GithubItem } from "#shared/types/dashboard";

// `showRepo` is for a property that spans several repos, where numbers collide.
const props = defineProps<{ items: GithubItem[]; showRepo: boolean }>();

const rows = computed(() =>
  props.items.map((item) => ({
    ...item,
    key: `${item.repo}#${item.number}`,
    kindLabel: item.kind === "pr" ? "PR" : "Issue",
    badgeTone: item.kind === "pr" ? "info" : undefined,
    reference: `${props.showRepo ? item.repo : ""}#${item.number}`,
  })),
);
</script>

<style scoped>
.empty {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}
.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 10px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.item:first-child {
  border-top: 0;
}
.item-link {
  display: flex;
  gap: 8px;
  min-width: 0;
  color: var(--ink);
  text-decoration: none;
}
.item-link:hover .item-title,
.item-link:focus-visible .item-title {
  text-decoration: underline;
}
.item-ref {
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
}
.item-title {
  font-size: 13px;
}
.labels {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
