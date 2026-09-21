<template>
  <div class="post-matrix">
    <span class="metric-label">RECENT POSTS × PLATFORM</span>
    <div class="matrix-head">
      <span class="col-post">POST</span>
      <span v-for="platform in platforms" :key="platform" class="col-cell">
        {{ platform.toUpperCase() }}
      </span>
    </div>
    <ul class="matrix-rows">
      <li v-for="post in posts" :key="post.title" class="matrix-row">
        <span class="col-post">{{ post.title }}</span>
        <span v-for="(cell, index) in post.cells" :key="index" class="col-cell">
          <span class="cell-pill" :class="cell.tone">{{ cell.label }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  platforms: string[];
  posts: {
    title: string;
    cells: { label: string; tone: "live" | "failed" | "queued" | "off" }[];
  }[];
}>();
</script>

<style scoped>
.post-matrix {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}
.matrix-head {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-3);
}
.col-post {
  flex-grow: 1;
  min-width: 0;
}
.col-cell {
  width: 96px;
  display: flex;
  justify-content: center;
}
.matrix-head .col-cell {
  display: block;
  text-align: center;
}
.matrix-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.matrix-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-top: 1px solid var(--line-3);
}
.matrix-row .col-post {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-pill {
  padding: 2px 8px;
  border-radius: var(--r-sm);
  font-size: 9px;
  font-weight: 700;
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
