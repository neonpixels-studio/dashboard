<template>
  <div class="page-shell">
    <h1 class="sr-only">Dashboard</h1>
    <ControlTopBar />

    <main class="overview-body">
      <SectionLabel label="ALL PROPERTIES" :meta="syncMeta" />

      <div class="rollup-grid">
        <template v-if="overviewPending">
          <MetricTileSkeleton v-for="index in ROLLUP_TILE_COUNT" :key="index" />
        </template>

        <DataErrorState
          v-else-if="overviewError"
          class="rollup-error"
          message="Couldn't load the studio rollups."
          :last-synced-at="overview?.lastSyncedAt ?? null"
          @retry="refreshOverview"
        />

        <template v-else>
          <RollupMrrTile
            :value-label="mrrValueLabel"
            :delta-label="mrrDeltaLabel"
            :delta-tone="mrrDeltaTone"
            :has-sparkline="hasMrrSparkline"
            :sparkline-path="mrrSparklinePath"
          />
          <RollupStatTile
            label="ACTIVE SUBSCRIBERS"
            :value-label="activeSubscribersValueLabel"
            :delta-label="activeSubscribersDeltaLabel"
            :delta-tone="activeSubscribersDeltaTone"
            :items="activeSubscriberStats"
            empty-message="No subscriber data synced yet."
          />
          <RollupStatTile
            label="SESSIONS · 30 DAYS"
            :value-label="sessionsValueLabel"
            :delta-label="sessionsDeltaLabel"
            :delta-tone="sessionsDeltaTone"
            :items="sessionSourceStats"
            empty-message="No session data synced yet."
          />
          <RollupIssuesTile
            :value-label="openIssuesValueLabel"
            :delta-label="openIssuesDeltaLabel"
            :items="openIssueStats"
            empty-message="No issue data synced yet."
          />
        </template>
      </div>

      <!-- @todo: this panel (per-property sessions chart + 30-day totals)
           needs its own studio-wide, per-app historical sessions endpoint —
           OverviewResponse only carries the studio rollup, not a series per
           property. Out of scope for #18 (the four top rollup tiles); no
           tracking issue exists for it yet. -->
      <div class="card sessions-panel">
        <div class="sessions-chart">
          <div class="panel-head">
            <span class="panel-title">Sessions by property</span>
            <span class="panel-meta">GOOGLE ANALYTICS · DAILY</span>
          </div>
          <PropertySessionsChart :series="sessionSeries" />
          <AxisRow />
        </div>

        <div class="totals">
          <span class="metric-label totals-label">30-DAY TOTAL</span>
          <StatList :items="totals" />
        </div>
      </div>

      <SectionLabel
        id="properties"
        label="PROPERTIES"
        :meta="`${propertyCount} / ${propertyCount}`"
        class="section-gap"
      />

      <div id="integrations" class="property-grid">
        <PropertyCard
          v-for="app in cardViewModels"
          :key="app.slug"
          :app="app"
          :has-error="hasAppsError"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { APPS, findAppBySlug, sortByAppOrder } from "~/config/apps";
import { toAppCardViewModel } from "~/utils/appViewModel";
import { useOverview } from "~/composables/useOverview";
import { useApps } from "~/composables/useApps";
import { formatRelativeTime } from "~/utils/relativeTime";
import { buildSparklinePath } from "~/utils/sparklinePath";
import {
  channelLabel,
  formatPct,
  formatCompactCount,
  formatCount,
  formatCountDelta,
  formatCurrency,
  formatIssuesSinceYesterday,
  formatOrDash,
  formatPctDelta,
  formatSyncedDate,
  countGrowthDeltaTone,
  pctGrowthDeltaTone,
} from "~/utils/rollupFormat";
import type { AppMetricSplit } from "#shared/types/dashboard";

useHead({ title: "Overview · Neon Pixels Control" });

const ROLLUP_TILE_COUNT = 4;
const MRR_SPARKLINE_VIEW_BOX_WIDTH = 320;
const MRR_SPARKLINE_VIEW_BOX_HEIGHT = 72;
// A single point can't be told apart from "not enough data" (nothing to draw
// a trend between), so the sparkline (and its paired delta, computed the
// same way server-side) only appears once there are at least two.
const MIN_SPARKLINE_POINTS = 2;

const propertyCount = String(APPS.length).padStart(2, "0");

const { data: appsData, error: appsError } = useApps();

// Merges each property's static identity with its fetched card, keyed by
// slug rather than assuming the API returns rows in APPS' order. A slug
// GET /api/apps hasn't returned yet (still loading, or the fetch failed)
// merges in as `card: null`, so PropertyCard renders its own skeleton/error
// state instead of a stale or fabricated one.
const cardViewModels = computed(() =>
  APPS.map((app) =>
    toAppCardViewModel(
      app,
      appsData.value?.find((card) => card.slug === app.slug) ?? null,
    ),
  ),
);

const hasAppsError = computed(() => !!appsError.value);

function accentFor(slug: string): string {
  return findAppBySlug(slug)?.accent ?? "var(--ink-3)";
}

function nameFor(slug: string): string {
  return findAppBySlug(slug)?.name ?? slug;
}

const {
  data: overview,
  pending: overviewPending,
  error: overviewError,
  refresh: refreshOverview,
} = useOverview();

const hasMrrSparkline = computed(
  () => (overview.value?.mrr.series.length ?? 0) >= MIN_SPARKLINE_POINTS,
);
const mrrSparklinePath = computed(() =>
  buildSparklinePath(
    overview.value?.mrr.series ?? [],
    MRR_SPARKLINE_VIEW_BOX_WIDTH,
    MRR_SPARKLINE_VIEW_BOX_HEIGHT,
  ),
);

const mrrValueLabel = computed(() =>
  formatOrDash(overview.value?.mrr.value, formatCurrency),
);
const mrrDeltaLabel = computed(() =>
  formatPctDelta(overview.value?.mrr.delta ?? null),
);
const mrrDeltaTone = computed(() =>
  pctGrowthDeltaTone(overview.value?.mrr.delta ?? null),
);

const activeSubscribersValueLabel = computed(() =>
  formatOrDash(overview.value?.activeSubscribers.value, formatCount),
);
const activeSubscribersDeltaLabel = computed(() =>
  formatCountDelta(overview.value?.activeSubscribers.delta ?? null),
);
const activeSubscribersDeltaTone = computed(() =>
  countGrowthDeltaTone(overview.value?.activeSubscribers.delta ?? null),
);

const sessionsValueLabel = computed(() =>
  formatOrDash(overview.value?.sessions30d.value, formatCompactCount),
);
const sessionsDeltaLabel = computed(() =>
  formatPctDelta(overview.value?.sessions30d.delta ?? null),
);
const sessionsDeltaTone = computed(() =>
  pctGrowthDeltaTone(overview.value?.sessions30d.delta ?? null),
);

const openIssuesValueLabel = computed(() =>
  formatOrDash(overview.value?.openIssues.value, formatCount),
);
// A "since yesterday" sentence rather than an arrow — open issues never
// gets the ok/growth tone treatment the other three tiles do:
// RollupIssuesTile never passes a `delta-tone` prop to RollupValueRow, so
// its "muted" default always applies, since more issues is never the
// "good" direction to celebrate in green.
const openIssuesDeltaLabel = computed(() =>
  formatIssuesSinceYesterday(overview.value?.openIssues.delta ?? null),
);

// Shared by the two `byApp`-shaped tiles (active subscribers, open issues) —
// sessions' `bySource` split has its own shape (channel, not slug) and its
// own sort order (by share of traffic, not property order), so it isn't
// routed through this.
function statListFromAppSplit(
  byApp: AppMetricSplit[],
  formatValue: (_value: number) => string,
) {
  return sortByAppOrder(byApp).map((entry) => ({
    label: nameFor(entry.slug),
    value: formatValue(entry.value),
    swatch: accentFor(entry.slug),
  }));
}

const activeSubscriberStats = computed(() =>
  statListFromAppSplit(
    overview.value?.activeSubscribers.byApp ?? [],
    formatCount,
  ),
);
// No severity field exists on this row yet (metric_snapshot has no severity
// column, and the Sentry provider that would populate one is #16) — the
// mock's FATAL/ERROR/WARN chips aren't real data, so they're dropped rather
// than fabricated. See this PR's follow-up suggestions.
const openIssueStats = computed(() =>
  statListFromAppSplit(overview.value?.openIssues.byApp ?? [], formatCount),
);

const sessionSourceStats = computed(() =>
  [...(overview.value?.sessions30d.bySource ?? [])]
    .sort((a, b) => b.pct - a.pct)
    .map((source) => ({
      label: channelLabel(source.channel),
      value: formatPct(source.pct),
    })),
);

// SSR and the initial client render can't know how long ago "now" is without
// mismatching each other (see DataErrorState.vue's identical reasoning), so
// the relative half of the sync label only fills in after mount; the
// absolute date half is pure data (derived from lastSyncedAt, not from wall
// clock) and safe to compute eagerly.
const relativeSyncLabel = ref<string | null>(null);

// "Xm ago" goes stale the longer the tab stays open on its own — recomputed
// on an interval (re-reading lastSyncedAt fresh each tick, not just once at
// mount) as well as whenever lastSyncedAt itself changes via refresh.
const SYNC_LABEL_REFRESH_MS = 60_000;

function updateRelativeSyncLabel() {
  const lastSyncedAt = overview.value?.lastSyncedAt ?? null;
  relativeSyncLabel.value = lastSyncedAt
    ? formatRelativeTime(lastSyncedAt)
    : null;
}

let syncLabelInterval: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  watch(() => overview.value?.lastSyncedAt ?? null, updateRelativeSyncLabel, {
    immediate: true,
  });
  syncLabelInterval = setInterval(
    updateRelativeSyncLabel,
    SYNC_LABEL_REFRESH_MS,
  );
});
onUnmounted(() => {
  clearInterval(syncLabelInterval);
});

const syncedDateLabel = computed(() => {
  const lastSyncedAt = overview.value?.lastSyncedAt;
  return lastSyncedAt ? formatSyncedDate(lastSyncedAt) : null;
});

// Both halves must be ready before showing anything — a meta reading just
// "SYNCED · 19 SEP 2026" (missing its relative half because it hasn't
// mounted yet) would flash on every load.
const syncMeta = computed(() => {
  if (!relativeSyncLabel.value || !syncedDateLabel.value) {
    return undefined;
  }
  return `SYNCED ${relativeSyncLabel.value.toUpperCase()} · ${syncedDateLabel.value}`;
});

// One series per property, colored with that property's accent. The final y of
// each path positions its endpoint dot.
const sessionSeries = [
  {
    slug: "grimicorn",
    endY: 63.2,
    path: "M0 68.8 C5.2 68.1 20.6 66 31 64.8 C41.4 63.6 51.8 61.7 62.1 61.7 C72.5 61.7 82.8 64.6 93.1 64.9 C103.4 65.2 113.8 63.3 124.1 63.4 C134.4 63.5 144.8 64.5 155.2 65.7 C165.5 66.9 175.9 69.1 186.2 70.4 C196.5 71.7 206.8 72.5 217.2 73.3 C227.5 74 238 75.2 248.3 74.9 C258.7 74.6 269 71.8 279.3 71.4 C289.6 71 300 72.8 310.3 72.6 C320.6 72.4 331 70.8 341.4 70.2 C351.8 69.6 362.1 69.8 372.4 69.1 C382.7 68.4 393 66.2 403.4 65.9 C413.8 65.6 424.1 67.3 434.5 67.4 C444.9 67.5 455.1 67.5 465.5 66.7 C475.9 65.9 486.3 64 496.6 62.8 C507 61.6 517.3 60.1 527.6 59.4 C537.9 58.7 548.3 58 558.6 58.7 C569 59.4 579.4 63.1 589.7 63.4 C600.1 63.7 610.4 61.2 620.7 60.6 C631 60 641.4 60.6 651.7 60 C662.1 59.4 672.4 57 682.8 57 C693.1 57 703.5 60.1 713.8 60.2 C724.1 60.3 734.4 57.9 744.8 57.7 C755.1 57.5 765.5 59 775.9 59.2 C786.3 59.4 796.6 58.3 806.9 59 C817.2 59.7 827.5 62.8 837.9 63.3 C848.3 63.8 858.6 62.3 869 62.3 C879.4 62.3 894.8 63.1 900 63.2",
  },
  {
    slug: "danholloran",
    endY: 14,
    path: "M0 93.1 C5.2 93.3 20.6 93.7 31 94.1 C41.4 94.5 51.8 95.9 62.1 95.4 C72.5 94.9 82.8 91.6 93.1 91.1 C103.4 90.6 113.8 92.8 124.1 92.3 C134.4 91.8 144.8 89.4 155.2 88.1 C165.5 86.8 175.9 84.9 186.2 84.5 C196.5 84.1 206.8 85.5 217.2 85.6 C227.5 85.7 238 85.4 248.3 85.1 C258.7 84.8 269 84.9 279.3 83.9 C289.6 82.9 300 80.8 310.3 79.1 C320.6 77.4 331 75.3 341.4 73.5 C351.8 71.7 362.1 69.4 372.4 68.2 C382.7 67 393 66.8 403.4 66.6 C413.8 66.4 424.1 68.1 434.5 67.2 C444.9 66.3 455.1 62.7 465.5 61.4 C475.9 60.1 486.3 60.3 496.6 59.2 C507 58.1 517.3 56 527.6 54.6 C537.9 53.2 548.3 51.5 558.6 50.9 C569 50.3 579.4 51.9 589.7 50.9 C600.1 49.9 610.4 46.9 620.7 44.9 C631 42.9 641.4 39.7 651.7 38.6 C662.1 37.5 672.4 38.6 682.8 38.1 C693.1 37.6 703.5 36.5 713.8 35.4 C724.1 34.3 734.4 33.1 744.8 31.4 C755.1 29.7 765.5 26.6 775.9 25 C786.3 23.4 796.6 22.5 806.9 21.5 C817.2 20.5 827.5 20.1 837.9 19.1 C848.3 18.1 858.6 16.4 869 15.6 C879.4 14.8 894.8 14.3 900 14",
  },
  {
    slug: "wanderist",
    endY: 120.7,
    path: "M0 124.2 C5.2 124.3 20.6 124.7 31 124.7 C41.4 124.7 51.8 124.2 62.1 124 C72.5 123.8 82.8 123.9 93.1 123.6 C103.4 123.3 113.8 122.7 124.1 122.1 C134.4 121.5 144.8 120.2 155.2 120 C165.5 119.8 175.9 121.1 186.2 121 C196.5 120.9 206.8 119.5 217.2 119.5 C227.5 119.5 238 121 248.3 120.8 C258.7 120.6 269 118.4 279.3 118.2 C289.6 118 300 119.2 310.3 119.4 C320.6 119.6 331 118.9 341.4 119.2 C351.8 119.5 362.1 121.2 372.4 121.2 C382.7 121.2 393 119.4 403.4 119.3 C413.8 119.2 424.1 120 434.5 120.4 C444.9 120.8 455.1 121.2 465.5 121.6 C475.9 122 486.3 122.8 496.6 122.8 C507 122.8 517.3 121.6 527.6 121.6 C537.9 121.6 548.3 122 558.6 122.6 C569 123.1 579.4 124.5 589.7 124.9 C600.1 125.3 610.4 125.1 620.7 125.1 C631 125.1 641.4 125.3 651.7 124.9 C662.1 124.5 672.4 123.6 682.8 122.8 C693.1 122 703.5 120.9 713.8 120.2 C724.1 119.5 734.4 118.9 744.8 118.7 C755.1 118.5 765.5 119.1 775.9 118.8 C786.3 118.5 796.6 117.1 806.9 117 C817.2 116.9 827.5 117.5 837.9 118 C848.3 118.5 858.6 119.6 869 120.1 C879.4 120.5 894.8 120.6 900 120.7",
  },
  {
    slug: "basin",
    endY: 131.4,
    path: "M0 156.1 C5.2 156 20.6 155.8 31 155.4 C41.4 155 51.8 154 62.1 153.4 C72.5 152.8 82.8 152.1 93.1 151.8 C103.4 151.5 113.8 152 124.1 151.7 C134.4 151.3 144.8 150.2 155.2 149.7 C165.5 149.2 175.9 148.8 186.2 148.6 C196.5 148.4 206.8 148.3 217.2 148.5 C227.5 148.7 238 149.8 248.3 149.7 C258.7 149.6 269 148.3 279.3 148.2 C289.6 148.1 300 149.2 310.3 149 C320.6 148.8 331 147.7 341.4 147.3 C351.8 146.9 362.1 146.9 372.4 146.5 C382.7 146.1 393 145.5 403.4 145 C413.8 144.5 424.1 144.3 434.5 143.7 C444.9 143.1 455.1 141.8 465.5 141.5 C475.9 141.2 486.3 142 496.6 142.1 C507 142.2 517.3 142.1 527.6 142.1 C537.9 142.1 548.3 142.2 558.6 142.3 C569 142.4 579.4 142.6 589.7 142.5 C600.1 142.4 610.4 141.6 620.7 141.5 C631 141.4 641.4 141.9 651.7 141.9 C662.1 141.9 672.4 141.7 682.8 141.6 C693.1 141.5 703.5 141.2 713.8 141.1 C724.1 141 734.4 141.2 744.8 141 C755.1 140.8 765.5 140.5 775.9 140.1 C786.3 139.7 796.6 139 806.9 138.3 C817.2 137.6 827.5 136.8 837.9 136.1 C848.3 135.4 858.6 134.8 869 134 C879.4 133.2 894.8 131.8 900 131.4",
  },
  {
    slug: "markpost",
    endY: 171.6,
    path: "M0 185.4 C5.2 185.5 20.6 186.1 31 186 C41.4 185.9 51.8 185.1 62.1 184.8 C72.5 184.6 82.8 184.5 93.1 184.5 C103.4 184.5 113.8 185.1 124.1 185 C134.4 184.9 144.8 184.1 155.2 183.8 C165.5 183.5 175.9 183.2 186.2 183.2 C196.5 183.2 206.8 183.5 217.2 183.6 C227.5 183.7 238 183.9 248.3 183.8 C258.7 183.7 269 183.1 279.3 182.9 C289.6 182.7 300 182.8 310.3 182.5 C320.6 182.3 331 181.6 341.4 181.4 C351.8 181.3 362.1 181.8 372.4 181.6 C382.7 181.4 393 180.3 403.4 180 C413.8 179.7 424.1 179.8 434.5 179.7 C444.9 179.6 455.1 179.6 465.5 179.4 C475.9 179.2 486.3 178.9 496.6 178.6 C507 178.3 517.3 177.9 527.6 177.8 C537.9 177.7 548.3 178.2 558.6 178.2 C569 178.2 579.4 177.9 589.7 177.6 C600.1 177.3 610.4 176.8 620.7 176.6 C631 176.4 641.4 176.6 651.7 176.6 C662.1 176.6 672.4 176.9 682.8 176.8 C693.1 176.7 703.5 176.1 713.8 175.9 C724.1 175.7 734.4 176 744.8 175.8 C755.1 175.6 765.5 175 775.9 174.8 C786.3 174.6 796.6 174.6 806.9 174.5 C817.2 174.4 827.5 174.7 837.9 174.5 C848.3 174.3 858.6 173.6 869 173.1 C879.4 172.6 894.8 171.8 900 171.6",
  },
].map((series) => ({ ...series, color: accentFor(series.slug) }));

const totals = [
  {
    label: "danholloran.me",
    value: "12.4K",
    delta: "+44%",
    swatch: accentFor("danholloran"),
  },
  {
    label: "grimicorn.dev",
    value: "11.9K",
    delta: "−6%",
    deltaTone: "muted" as const,
    swatch: accentFor("grimicorn"),
  },
  {
    label: "wanderist.io",
    value: "9.1K",
    delta: "+9%",
    swatch: accentFor("wanderist"),
  },
  {
    label: "basin.fm",
    value: "8.6K",
    delta: "+22%",
    swatch: accentFor("basin"),
  },
  {
    label: "markpost.io",
    value: "6.2K",
    delta: "+38%",
    swatch: accentFor("markpost"),
  },
  {
    label: "neonpixels.dev",
    value: "6.1K",
    delta: "+7%",
    muted: true,
    swatch: accentFor("neonpixels"),
  },
];
</script>

<style scoped>
.overview-body {
  flex-grow: 1;
  padding: 26px 32px 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rollup-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.rollup-error {
  grid-column: 1 / -1;
}
.sessions-panel {
  padding: 20px 24px 18px;
  display: flex;
  gap: 28px;
}
.sessions-chart {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.panel-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
.totals {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 4px;
}
.totals-label {
  padding-bottom: 3px;
}
.totals :deep(.label),
.totals :deep(.value) {
  font-size: 12px;
}
.section-gap {
  margin-top: 8px;
}
.property-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
</style>
