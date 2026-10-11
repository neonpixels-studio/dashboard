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
        <span class="col-post">
          <a
            class="post-link"
            :href="post.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ post.title }}</a
          >
        </span>
        <SyndicationPostCell
          v-for="(cell, index) in post.cells"
          :key="index"
          class="col-cell"
          :cell="cell"
          :link-label="`${post.title} on ${platforms[index]}`"
        />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import SyndicationPostCell from "./SyndicationPostCell.vue";
import type { SyndicationMatrixPostView } from "~/utils/syndicationMatrix";

defineProps<{
  platforms: string[];
  posts: SyndicationMatrixPostView[];
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
  flex-direction: column;
  align-items: center;
  gap: 3px;
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
.post-link {
  color: inherit;
  text-decoration: none;
}
.post-link:hover,
.post-link:focus-visible {
  text-decoration: underline;
}
</style>
