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
        <span v-if="failedCount > 0" class="panel-meta failed-count">
          {{ crossPostFailuresLabel(failedCount) }}
        </span>
        <span class="grow"></span>
      </div>
      <!-- @todo: a "Retry failed" action belongs here once a real retry
           endpoint exists (POST /api/sync only re-runs every vendor's
           regular poll, not a single failed cross-post) — omitted rather
           than shown with no handler behind it. -->

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
  METRIC_VIEWS,
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

// Shown only when non-zero: every provider today is read-only and only ever
// writes "synced", so a permanent "0 failures" tile would be dead weight.
function crossPostFailuresLabel(count: number): string {
  return `${count} FAILED CROSS-POST${count === 1 ? "" : "S"}`;
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
    buildMetricTileData(METRIC_VIEWS, PERIOD_CURRENT, metrics, series),
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
.panel-meta.failed-count {
  color: var(--warn);
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
</style>
