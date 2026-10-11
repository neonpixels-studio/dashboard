<template>
  <div class="card sentry-panel">
    <PanelHead title="Sentry">
      <span class="grow"></span>
      <a
        v-if="panel"
        class="view-all"
        :href="panel.issuesUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        View all issues<span class="visually-hidden">
          in Sentry (opens in a new tab)</span
        >
      </a>
    </PanelHead>

    <div v-if="showSkeleton" class="loading" aria-hidden="true">
      <SkeletonBlock height="60px" radius="var(--r-sm)" />
      <SkeletonBlock height="96px" radius="var(--r-sm)" />
    </div>

    <p v-else-if="isNotConfigured" class="state">
      Sentry isn't configured for this property.
    </p>

    <div v-else-if="showError" class="state" role="alert">
      <span>Couldn't load Sentry issues.</span>
      <button type="button" class="retry-btn" @click="emit('retry')">
        Retry
      </button>
    </div>

    <template v-else-if="panel">
      <SentryEventsTrend
        v-if="trendPath"
        :path="trendPath"
        :total="trendTotal"
        :chart-label="`${app.name} Sentry events over the last 14 days`"
      />
      <SentryIssueList v-if="rows.length" :rows="rows" />
      <p v-else class="state">No unresolved issues.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
// The Sentry card of MONEY & HEALTH on the product detail pages, rendered
// from the live /api/apps/[slug]/sentry response. A failed refresh keeps the
// last good data on screen rather than replacing it with an error.
import type { SentryPanelResponse } from "#shared/types/dashboard";
import type { DashboardApp } from "~/config/apps";
import { formatCount } from "~/utils/rollupFormat";
import {
  buildSentryIssueRows,
  buildSentryTrendPath,
} from "~/utils/sentryPanel";

const HTTP_NOT_FOUND = 404;

const props = defineProps<{
  app: DashboardApp;
  panel: SentryPanelResponse | null;
  pending: boolean;
  error: unknown;
}>();

const emit = defineEmits<{ retry: [] }>();

// No panel and no error covers the pre-fetch moment of a client-only fetch;
// `pending` swaps a stale error for the skeleton while Retry is in flight.
const showSkeleton = computed(
  () => !props.panel && (props.pending || !props.error),
);
// The endpoint 404s when the app has no Sentry project/token; retrying can't
// fix that, so it gets its own state instead of the retryable error.
const isNotConfigured = computed(
  () =>
    !props.panel &&
    (props.error as { statusCode?: number } | null)?.statusCode ===
      HTTP_NOT_FOUND,
);
const showError = computed(() => !!props.error && !props.panel);
const rows = computed(() => buildSentryIssueRows(props.panel?.issues ?? []));
const trendPath = computed(() =>
  buildSentryTrendPath(props.panel?.trend ?? []),
);
const trendTotal = computed(() =>
  formatCount(props.panel?.trendTotalEvents ?? 0),
);
</script>

<style scoped>
.sentry-panel {
  flex: 2;
  min-width: 0;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.view-all {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-2);
  text-decoration: underline;
}
.view-all:hover,
.view-all:focus-visible {
  color: var(--ink);
}
.loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.state {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--ink-2);
}
.retry-btn {
  padding: 3px 9px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 10px;
  color: var(--ink-2);
  cursor: pointer;
}
</style>
