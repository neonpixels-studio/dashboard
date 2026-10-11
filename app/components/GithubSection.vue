<template>
  <section class="github-section" aria-label="GitHub">
    <SectionLabel label="GITHUB" meta="ISSUES · PRS · CI" />
    <p v-if="!github.configured" class="card not-configured">
      GitHub is not configured. Set <code>NUXT_GITHUB_TOKEN</code> to show open
      issues, pull requests and CI for this property.
    </p>
    <template v-else>
      <GithubTiles :tiles="tiles" :ci-repo-rows="ciRepoRows" />
      <div class="card list-panel">
        <PanelHead title="Open issues &amp; PRs" :meta="listMeta" />
        <GithubItemList :items="github.items" :show-repo="isMultiRepo" />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { GithubDetail } from "#shared/types/dashboard";
import { buildCiRepoRows, buildGithubTiles } from "~/utils/githubPanel";

const props = defineProps<{ github: GithubDetail }>();

const tiles = computed(() => buildGithubTiles(props.github));
const ciRepoRows = computed(() => buildCiRepoRows(props.github));
const isMultiRepo = computed(() => props.github.repos.length > 1);
const listMeta = computed(() => `${props.github.items.length} OPEN`);
</script>

<style scoped>
.github-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.not-configured {
  margin: 0;
  padding: 17px 19px;
  font-size: 12px;
  color: var(--ink-2);
}
.list-panel {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
