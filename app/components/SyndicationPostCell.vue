<template>
  <span>
    <a
      v-if="cell.url"
      class="cell-pill cell-link"
      :class="cell.tone"
      :href="cell.url"
      :aria-label="`${linkLabel}, ${cell.label}`"
      target="_blank"
      rel="noopener noreferrer"
      >{{ cell.label }}</a
    >
    <span v-else class="cell-pill" :class="cell.tone">{{ cell.label }}</span>
    <span v-if="cell.views" class="cell-stat cell-stat--views">{{
      cell.views
    }}</span>
    <span v-if="cell.likes" class="cell-stat cell-stat--likes">{{
      cell.likes
    }}</span>
    <span v-if="cell.comments" class="cell-stat cell-stat--comments">{{
      cell.comments
    }}</span>
  </span>
</template>

<script setup lang="ts">
import type { SyndicationMatrixCellView } from "~/utils/syndicationMatrix";

defineProps<{
  cell: SyndicationMatrixCellView;
  linkLabel: string;
}>();
</script>

<style scoped>
.cell-link {
  text-decoration: none;
}
.cell-link:hover,
.cell-link:focus-visible {
  text-decoration: underline;
}
.cell-pill {
  padding: 2px 8px;
  border-radius: var(--r-sm);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}
.cell-stat {
  font-size: 10px;
  color: var(--ink-3);
  white-space: nowrap;
}
.cell-pill.live {
  color: var(--ok);
  background: var(--ok-tint);
}
.cell-pill.failed {
  color: var(--err);
  background: var(--err-tint);
}
.cell-pill.queued {
  color: var(--warn);
  background: var(--warn-tint);
}
.cell-pill.off {
  color: var(--ink-3);
  background: var(--line-3);
}
</style>
