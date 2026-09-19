<template>
  <div class="detail-body">
    <SectionLabel label="REACH" meta="NO STRIPE OR CLERK ON THIS PROPERTY" />

    <div class="tile-grid">
      <MetricTile
        label="SESSIONS · OWN SITE"
        value="12.4K"
        delta="▲ 44%"
        sub="8.6K last month"
      />
      <MetricTile
        label="SYNDICATED VIEWS"
        value="8,914"
        delta="▲ 12%"
        sub="across 4 platforms"
      />
      <MetricTile
        label="POSTS PUBLISHED"
        value="3"
        delta="this month"
        delta-tone="muted"
        sub="2 dev · 1 travel"
      />
      <MetricTile
        label="CROSS-POST FAILURES"
        value="1"
        delta="ZyVOP"
        delta-tone="muted"
        sub="API 502 · retry queued"
        tone="warn"
      />
    </div>

    <div class="card syndication-panel">
      <div class="panel-head">
        <span class="panel-title">Syndication</span>
        <span class="panel-meta">MEDIUM · HASHNODE · DEV.TO · ZYVOP</span>
        <span class="grow"></span>
        <button type="button" class="retry-btn">
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

      <div class="platform-table">
        <div class="table-head">
          <span class="col-platform">PLATFORM</span>
          <span class="col-sync">LAST SYNC</span>
          <span class="col-num">POSTS</span>
          <span class="col-num wide">VIEWS 30D</span>
          <span class="col-num wide">REACTIONS</span>
          <span class="col-num wider">FOLLOWERS</span>
          <span class="col-status">STATUS</span>
        </div>
        <ul class="platform-rows">
          <li
            v-for="platform in PLATFORMS"
            :key="platform.name"
            class="platform-row"
          >
            <span class="col-platform name">{{ platform.name }}</span>
            <span class="col-sync" :class="{ warn: platform.warn }">
              {{ platform.lastSync }}
            </span>
            <span class="col-num">{{ platform.posts }}</span>
            <span class="col-num wide strong">{{ platform.views }}</span>
            <span class="col-num wide">{{ platform.reactions }}</span>
            <span class="col-num wider">{{ platform.followers }}</span>
            <span class="col-status">
              <span class="status-pill" :class="platform.warn ? 'warn' : 'ok'">
                <span class="dot" aria-hidden="true"></span>
                {{ platform.status }}
              </span>
            </span>
          </li>
        </ul>
      </div>

      <SyndicationPostMatrix
        :platforms="PLATFORMS.map((platform) => platform.name)"
        :posts="POSTS"
      />
    </div>

    <SectionLabel
      label="TRAFFIC"
      meta="GOOGLE ANALYTICS · GA4"
      class="section-gap"
    />

    <TrafficPanel
      :app="app"
      :stats="[
        { label: 'SESSIONS', value: '12,431' },
        { label: 'USERS', value: '9,882' },
        { label: 'AVG TIME', value: '4:02' },
        { label: 'BOUNCE', value: '46%' },
      ]"
      delta="▲ 44% vs prev 30d"
      :path="SESSIONS_PATH"
      :lists="[
        {
          title: 'TOP POSTS ON SITE',
          items: [
            { label: '/posts/agent-that-never-sleeps', value: '3,188' },
            { label: '/posts/five-analytics-tools', value: '2,415' },
            { label: '/posts/missouri-ozarks', value: '1,904' },
            { label: '/resume', value: '1,461' },
            { label: '/photos', value: '988' },
          ],
        },
      ]"
    />

    <SourcesFooter
      :sources="[
        { label: 'GOOGLE ANALYTICS · 6m' },
        { label: 'MEDIUM · 3h' },
        { label: 'HASHNODE · 3h' },
        { label: 'DEV.TO · 3h' },
        { label: 'ZYVOP · 2d', tone: 'warn' },
      ]"
      note-tag="STRIPE · CLERK · SENTRY NOT CONNECTED"
    />
  </div>
</template>

<script setup lang="ts">
import type { DashboardApp } from "~/config/apps";

defineProps<{ app: DashboardApp }>();

const SESSIONS_PATH =
  "M0 136 C5 135.6 19.8 135.9 29.7 133.3 C39.6 130.7 49.4 123.1 59.3 120.6 C69.2 118.1 79.1 120 89 118.3 C98.9 116.6 108.7 111.5 118.6 110.6 C128.5 109.7 138.4 114.4 148.3 112.9 C158.2 111.4 168 103.4 177.9 101.8 C187.8 100.2 197.7 105.1 207.6 103.5 C217.5 101.9 227.3 94.3 237.2 92 C247.1 89.7 257 91.2 266.9 89.7 C276.8 88.2 286.7 86.1 296.6 82.9 C306.5 79.8 316.3 72.9 326.2 70.8 C336.1 68.7 346 69.5 355.9 70.1 C365.8 70.7 375.6 73 385.5 74.2 C395.4 75.4 405.3 77.9 415.2 77.4 C425.1 76.9 434.9 71.9 444.8 71 C454.7 70.1 464.6 73.8 474.5 72.1 C484.4 70.4 494.2 63.8 504.1 61 C514 58.2 523.9 56.2 533.8 55.3 C543.7 54.4 553.5 55.9 563.4 55.6 C573.3 55.4 583.2 54.6 593.1 53.8 C603 53 612.9 50.9 622.8 50.8 C632.7 50.7 642.5 53.6 652.4 53.2 C662.3 52.8 672.2 51.1 682.1 48.3 C692 45.5 701.8 40.5 711.7 36.4 C721.6 32.3 731.5 26.9 741.4 23.9 C751.3 20.8 761.1 18.7 771 18.1 C780.9 17.5 790.8 20 800.7 20.2 C810.6 20.4 820.4 20.2 830.3 19.2 C840.2 18.2 855 14.9 860 14";

const PLATFORMS = [
  {
    name: "Medium",
    lastSync: "3h ago",
    posts: "41",
    views: "4,102",
    reactions: "318",
    followers: "1,204",
    status: "SYNCED",
    warn: false,
  },
  {
    name: "Hashnode",
    lastSync: "3h ago",
    posts: "28",
    views: "2,466",
    reactions: "204",
    followers: "612",
    status: "SYNCED",
    warn: false,
  },
  {
    name: "dev.to",
    lastSync: "3h ago",
    posts: "28",
    views: "2,101",
    reactions: "177",
    followers: "489",
    status: "SYNCED",
    warn: false,
  },
  {
    name: "ZyVOP",
    lastSync: "2d ago",
    posts: "26",
    views: "245",
    reactions: "31",
    followers: "84",
    status: "API 502",
    warn: true,
  },
];

type CellTone = "live" | "failed" | "queued" | "off";

const POSTS: {
  title: string;
  cells: { label: string; tone: CellTone }[];
  views: string;
}[] = [
  {
    title: "Shipping a Nuxt site with an agent that never sleeps",
    cells: [
      { label: "✓ LIVE", tone: "live" },
      { label: "✓ LIVE", tone: "live" },
      { label: "✓ LIVE", tone: "live" },
      { label: "✗ FAILED", tone: "failed" },
    ],
    views: "3,188",
  },
  {
    title: "Why I stopped paying for five analytics tools",
    cells: [
      { label: "✓ LIVE", tone: "live" },
      { label: "✓ LIVE", tone: "live" },
      { label: "✓ LIVE", tone: "live" },
      { label: "• QUEUED", tone: "queued" },
    ],
    views: "2,415",
  },
  {
    title: "Three days in the Missouri Ozarks",
    cells: [
      { label: "✓ LIVE", tone: "live" },
      { label: "— DEV ONLY", tone: "off" },
      { label: "— DEV ONLY", tone: "off" },
      { label: "— DEV ONLY", tone: "off" },
    ],
    views: "1,904",
  },
];
</script>

<style scoped>
.detail-body {
  flex-grow: 1;
  padding: 24px 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.section-gap {
  margin-top: 6px;
}
.tile-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
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
.platform-table {
  display: flex;
  flex-direction: column;
}
.table-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 9px;
  border-bottom: 1px solid var(--line);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}
.platform-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.platform-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
.platform-row:not(:last-child) {
  border-bottom: 1px solid var(--line-3);
}
.col-platform {
  width: 160px;
}
.platform-row .col-platform.name {
  font-size: 12px;
  font-weight: 600;
}
.col-sync {
  width: 110px;
  font-size: 11px;
  color: var(--ink-2);
}
.col-sync.warn {
  color: var(--warn);
}
.col-num {
  width: 90px;
  text-align: right;
  font-size: 11px;
}
.col-num.wide {
  width: 110px;
}
.col-num.wider {
  width: 120px;
}
.col-num.strong {
  font-weight: 600;
}
.col-status {
  flex-grow: 1;
  display: flex;
  justify-content: flex-end;
}
.table-head .col-status {
  display: block;
  text-align: right;
}
.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: var(--r-sm);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.status-pill .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill.ok {
  color: var(--ok);
  background: var(--ok-tint);
}
.status-pill.warn {
  color: var(--warn);
  background: var(--warn-tint);
}
</style>
