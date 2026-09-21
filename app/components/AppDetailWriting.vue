<template>
  <DetailStateShell
    :pending="pending"
    :error="error"
    :last-synced-at="app.detail?.lastSyncedAt ?? null"
    :refresh="refresh"
    :alerts="app.detail?.alerts ?? []"
    :has-data="!!app.detail"
  >
    <template #pending>
      <MetricTileGrid :tiles="[]" pending />
      <SkeletonBlock height="220px" radius="var(--r-lg)" />
      <SkeletonBlock height="180px" radius="var(--r-lg)" />
    </template>

    <SectionLabel label="REACH" meta="NO STRIPE OR CLERK ON THIS PROPERTY" />

    <MetricTileGrid :tiles="tiles" />

    <div class="card syndication-panel">
      <div class="panel-head">
        <span class="panel-title">Syndication</span>
        <span class="panel-meta">{{ platformsMeta }}</span>
        <span class="grow"></span>
        <!-- @todo: no retry endpoint exists yet (POST /api/sync only
             re-runs every vendor's regular poll, not a single failed
             cross-post) — hidden until there's something for it to do. -->
        <button v-if="failedCount > 0" type="button" class="retry-btn">
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.9-4.2"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path
              d="M13.6 2v3.2h-3.2"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Retry failed
        </button>
      </div>

      <SyndicationPostMatrix :platforms="platforms" :posts="posts" />
    </div>

    <SectionLabel
      label="TRAFFIC"
      meta="GOOGLE ANALYTICS · GA4"
      class="section-gap"
    />

    <TrafficPanel
      :app="app"
      :stats="trafficPanelData.stats"
      :delta="trafficPanelData.delta"
      :path="trafficPanelData.path"
      :axis-labels="trafficPanelData.axisLabels"
      :lists="trafficPanelData.lists"
    />

    <SourcesFooter :sources="sourceChips" />
  </DetailStateShell>
</template>

<script setup lang="ts">
import type { AppDetailTemplateProps } from "~/utils/appViewModel";
import {
  buildMetricTileData,
  METRIC_POSTS,
  METRIC_SESSIONS,
  PERIOD_30D,
  PERIOD_CURRENT,
  type MetricTileData,
} from "~/utils/metricTile";
import { NO_VALUE_LABEL } from "~/utils/rollupFormat";
import {
  syndicationFailedCount,
  syndicationLivePlatformCount,
  syndicationMatrixPosts,
  syndicationPlatforms,
} from "~/utils/syndicationMatrix";
import { useAppDetailPanels } from "~/composables/useAppDetailPanels";

const props = defineProps<AppDetailTemplateProps>();

const syndicationRows = computed(() => props.app.detail?.syndication ?? []);
const platforms = computed(() => syndicationPlatforms(syndicationRows.value));
const posts = computed(() =>
  syndicationMatrixPosts(syndicationRows.value, platforms.value),
);

const platformsMeta = computed(() =>
  platforms.value.length
    ? platforms.value.map((platform) => platform.toUpperCase()).join(" · ")
    : "NO PLATFORMS SYNCED YET",
);

function crossPostFailuresSub(failedCount: number): string {
  if (failedCount === 0) {
    return "All synced";
  }
  return `${failedCount} failed cross-post${failedCount === 1 ? "" : "s"}`;
}

const failedCount = computed(() =>
  syndicationFailedCount(syndicationRows.value),
);
const liveCount = computed(() =>
  syndicationLivePlatformCount(syndicationRows.value),
);

const tiles = computed<MetricTileData[]>(() => {
  const metrics = props.app.detail?.metrics ?? [];
  const series = props.app.detail?.series ?? [];

  return [
    buildMetricTileData(METRIC_SESSIONS, PERIOD_30D, metrics, series),
    buildMetricTileData(METRIC_POSTS, PERIOD_CURRENT, metrics, series),
    {
      label: "PLATFORMS LIVE",
      value: String(liveCount.value),
      delta: NO_VALUE_LABEL,
      deltaTone: "muted",
      // "posted to", not "configured" — this counts platforms with at least
      // one real syndication_post row, not integration_config's enabled set
      // (that catalog isn't on AppDetailResponse at all; see syncSource.ts).
      sub: `${platforms.value.length} platform${platforms.value.length === 1 ? "" : "s"} posted to`,
    },
    {
      label: "CROSS-POST FAILURES",
      value: String(failedCount.value),
      delta: NO_VALUE_LABEL,
      deltaTone: "muted",
      sub: crossPostFailuresSub(failedCount.value),
      tone: failedCount.value > 0 ? "warn" : undefined,
    },
  ];
});

const { trafficPanelData, sourceChips } = useAppDetailPanels(
  () => props.app.detail,
);
</script>

<style scoped>
.section-gap {
  margin-top: 6px;
}
.syndication-panel {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.panel-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
.retry-btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: transparent;
  font-family: inherit;
  font-size: 11px;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
}
</style>
