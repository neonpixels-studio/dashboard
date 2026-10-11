<template>
  <div class="github-tiles">
    <div v-for="tile in tiles" :key="tile.key" class="github-tile">
      <a
        class="tile-link"
        :href="tile.href"
        target="_blank"
        rel="noopener noreferrer"
      >
        <MetricTile
          :label="tile.label"
          :value="tile.value"
          delta=""
          :sub="tile.sub"
          :tone="tile.tone"
        />
        <span class="visually-hidden">
          {{ tile.label }} on GitHub (opens in a new tab)</span
        >
      </a>
      <ul v-if="tile.key === 'ci' && ciRepoRows.length" class="ci-repos">
        <li v-for="row in ciRepoRows" :key="row.repo">
          <a
            class="ci-repo-link"
            :class="row.tone"
            :href="row.href"
            target="_blank"
            rel="noopener noreferrer"
            >{{ row.label }}</a
          >
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GithubCiRepoRow, GithubTileData } from "~/utils/githubPanel";

defineProps<{ tiles: GithubTileData[]; ciRepoRows: GithubCiRepoRow[] }>();
</script>

<style scoped>
.github-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}
.github-tile {
  flex: 1 1 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tile-link {
  display: block;
  color: inherit;
  text-decoration: none;
}
.tile-link:hover :deep(.tile),
.tile-link:focus-visible :deep(.tile) {
  border-color: var(--ink-3);
}
.ci-repos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}
.ci-repo-link {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-2);
  text-decoration: underline;
}
.ci-repo-link.ok {
  color: var(--ok);
}
.ci-repo-link.warn {
  color: var(--warn);
}
.ci-repo-link.danger {
  color: var(--err);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
