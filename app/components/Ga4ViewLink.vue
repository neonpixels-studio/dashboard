<template>
  <a
    v-if="url"
    class="ga4-view-link"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
  >
    View<span class="visually-hidden">
      in Google Analytics (opens in a new tab)</span
    >
  </a>
</template>

<script setup lang="ts">
import type { AppDetailResponse } from "#shared/types/dashboard";
import { buildGa4ReportsUrl } from "~/utils/ga4Link";

const props = defineProps<{ detail: AppDetailResponse | null }>();

const url = computed(() => buildGa4ReportsUrl(props.detail?.ga4PropertyId));
</script>

<style scoped>
.ga4-view-link {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-2);
  text-decoration: underline;
}
.ga4-view-link:hover,
.ga4-view-link:focus-visible {
  color: var(--ink);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
