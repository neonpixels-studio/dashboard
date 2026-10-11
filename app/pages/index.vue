<template>
  <div class="page-shell">
    <h1 class="sr-only">Dashboard</h1>
    <ControlTopBar :range="range" @update:range="setRange" />

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
            :range-days="range"
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
            :label="`SESSIONS · ${range} DAYS`"
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

      <SessionsByPropertyPanel
        :properties="sessionsData ?? []"
        :pending="sessionsPending"
        :has-error="!!sessionsError"
        @retry="refreshSessions"
      />

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
          :is-pending="isAppsPending"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { APPS, findRollupSourceBySlug, sortByAppOrder } from "~/config/apps";
import { toAppCardViewModel } from "~/utils/appViewModel";
import { useOverview } from "~/composables/useOverview";
import { useOverviewRange } from "~/composables/useOverviewRange";
import { useApps } from "~/composables/useApps";
import { useOverviewSessions } from "~/composables/useOverviewSessions";
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
import type { AppMetricSplit, AppsResponse } from "#shared/types/dashboard";

useHead({ title: "Overview · Neon Pixels Control" });

const ROLLUP_TILE_COUNT = 4;
const MRR_SPARKLINE_VIEW_BOX_WIDTH = 320;
const MRR_SPARKLINE_VIEW_BOX_HEIGHT = 72;
// A single point can't be told apart from "not enough data" (nothing to draw
// a trend between), so the sparkline (and its paired delta, computed the
// same way server-side) only appears once there are at least two.
const MIN_SPARKLINE_POINTS = 2;

const propertyCount = String(APPS.length).padStart(2, "0");

const { data: appsData, pending: appsPending, error: appsError } = useApps();

// useFetch resets `data` back to its default at the start of every fetch
// cycle — including a refresh that ultimately errors — so `appsData` alone
// can't back the "stale data wins over a later error" behavior PropertyCard
// expects (see its own `hasError` prop doc comment, mirroring
// DataErrorState's "showing the last known state" for the overview
// rollups). Keep the last successful response separately and merge from
// that instead, so a refresh failure doesn't blank out cards that already
// loaded once.
const lastGoodAppsData = ref<AppsResponse | null>(null);
watch(
  appsData,
  (value) => {
    if (value) {
      lastGoodAppsData.value = value;
    }
  },
  { immediate: true },
);

// A property only counts as "still loading" once it has never had good
// data — driven off `lastGoodAppsData`, not "has the fetch ever settled",
// so this correctly distinguishes two cases a settle-based flag would
// conflate: a card that already resolved to "no data yet" doesn't flash
// back into its skeleton on a later refresh (lastGoodAppsData stays
// non-null, an empty array counts), while a card whose FIRST load failed
// and is now retrying correctly shows the skeleton again rather than a
// fabricated "no data yet" (lastGoodAppsData is still null either way).
const isAppsPending = computed(
  () => appsPending.value && lastGoodAppsData.value === null,
);

// Merges each property's static identity with its fetched card, keyed by
// slug rather than assuming the API returns rows in APPS' order. A slug
// GET /api/apps hasn't returned yet — still loading, the fetch failed, or
// it resolved with no row for that slug — merges in as `card: null`, so
// PropertyCard renders its own skeleton/error/empty state (distinguished
// via the `isPending`/`hasError` props below) instead of a stale or
// fabricated one.
const cardViewModels = computed(() =>
  APPS.map((app) =>
    toAppCardViewModel(
      app,
      lastGoodAppsData.value?.find((card) => card.slug === app.slug) ?? null,
    ),
  ),
);

const hasAppsError = computed(() => !!appsError.value);

function accentFor(slug: string): string {
  return findRollupSourceBySlug(slug)?.accent ?? "var(--ink-3)";
}

function nameFor(slug: string): string {
  return findRollupSourceBySlug(slug)?.name ?? slug;
}

const { range, setRange } = useOverviewRange();

const {
  data: overview,
  pending: overviewPending,
  error: overviewError,
  refresh: refreshOverview,
} = useOverview(range);

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

const {
  data: sessionsData,
  pending: sessionsPending,
  error: sessionsError,
  refresh: refreshSessions,
} = useOverviewSessions();
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
.section-gap {
  margin-top: 8px;
}
.property-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
</style>
