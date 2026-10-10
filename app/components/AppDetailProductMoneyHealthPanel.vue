<template>
  <div class="stripe-sentry">
    <AppDetailProductStripePanel :app="app" />

    <div class="card sentry-panel">
      <div class="panel-head">
        <span class="panel-title">Sentry</span>
        <span class="grow"></span>
        <span
          class="sample-chip"
          title="No Sentry detail endpoint exists yet (see PR follow-up)"
        >
          SAMPLE DATA
        </span>
      </div>

      <div class="error-rate">
        <div class="error-rate-head">
          <span class="metric-label">ERROR RATE</span>
          <span class="rate-value">0.31%</span>
          <span class="delta ok">▼ 0.18pp</span>
        </div>
        <SparkLine
          :path="ERROR_RATE_PATH"
          width="100%"
          :height="60"
          view-box="0 0 300 60"
          color="var(--warn)"
          :aria-label="`${app.name} error rate over the last 30 days`"
        />
      </div>

      <ul class="issues">
        <li v-for="issue in ISSUES" :key="issue.title" class="issue">
          <div class="issue-head">
            <span
              class="level-chip"
              :style="{
                color: issue.levelColor,
                background: `color-mix(in srgb, ${issue.levelColor} 15%, transparent)`,
              }"
            >
              {{ issue.level }}
            </span>
            <span class="issue-title">{{ issue.title }}</span>
          </div>
          <div class="issue-meta">
            <span>{{ issue.location }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ issue.events }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ issue.users }}</span>
            <span class="grow"></span>
            <span>{{ issue.age }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// The Stripe/Sentry detail panels for AppDetailProduct (issue #20) — split
// out purely to keep the parent template's size/complexity down. The Stripe
// half is wired to live data in AppDetailProductStripePanel (issue #109); the
// Sentry half below is still static sample content, tracked separately.
import type { AppDetailViewModel } from "~/utils/appViewModel";

defineProps<{ app: AppDetailViewModel }>();

const ERROR_RATE_PATH =
  "M0 33.2 C1.7 32.3 6.9 27.9 10.3 27.7 C13.8 27.5 17.3 29.9 20.7 32.1 C24.1 34.4 27.6 40.5 31 41.2 C34.5 41.9 37.9 37.8 41.4 36.1 C44.9 34.4 48.3 34 51.7 30.9 C55.2 27.8 58.6 20.5 62.1 17.6 C65.5 14.7 69 14.5 72.4 13.4 C75.9 12.3 79.3 12.2 82.8 11.3 C86.3 10.4 89.7 5.4 93.1 8 C96.5 10.6 100 22.8 103.4 27.1 C106.9 31.5 110.3 35.3 113.8 34.1 C117.3 32.9 120.6 21.7 124.1 19.9 C127.5 18.1 131.1 20.8 134.5 23.3 C137.9 25.9 141.4 33.5 144.8 35.2 C148.3 36.9 151.8 33.9 155.2 33.5 C158.6 33.1 162.1 31.9 165.5 32.7 C168.9 33.6 172.5 37.8 175.9 38.6 C179.3 39.4 182.8 38.1 186.2 37.7 C189.6 37.3 193.1 36.5 196.6 36 C200.1 35.5 203.5 34.8 206.9 34.9 C210.3 35 213.8 38.9 217.2 36.8 C220.6 34.7 224.1 23.3 227.6 22.1 C231.1 20.9 234.4 27.3 237.9 29.8 C241.4 32.3 244.9 36.3 248.3 37.1 C251.8 37.9 255.2 34.8 258.6 34.5 C262.1 34.2 265.6 32.4 269 35.3 C272.4 38.2 275.9 51.5 279.3 52 C282.8 52.5 286.3 42.9 289.7 38.3 C293.1 33.7 298.3 26.6 300 24.3";

const ISSUES = [
  {
    level: "ERROR",
    levelColor: "#D6A419",
    title: "TypeError: feed.items is undefined",
    location: "parsers/rss.ts:118",
    events: "41 events",
    users: "14 users",
    age: "12m ago",
  },
  {
    level: "ERROR",
    levelColor: "#D6A419",
    title: "FetchError: ETIMEDOUT overcast.fm",
    location: "jobs/poll.ts:52",
    events: "18 events",
    users: "3 users",
    age: "2h ago",
  },
  {
    level: "WARN",
    levelColor: "#9A9AA8",
    title: "Slow query: feed_items scan 2.4s",
    location: "db/queries.ts:9",
    events: "6 events",
    users: "6 users",
    age: "1d ago",
  },
];
</script>

<style scoped>
.stripe-sentry {
  display: flex;
  gap: 16px;
}
.sentry-panel {
  flex: 2;
  min-width: 0;
  padding: 20px 22px;
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
.error-rate {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.error-rate-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
}
.rate-value {
  font-size: 11px;
  font-weight: 600;
}
.error-rate-head .delta {
  font-size: 10px;
}
.issues {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line-3);
}
.issue {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px 0;
}
.issue:not(:last-child) {
  border-bottom: 1px solid var(--line-3);
}
.issue-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.issue-title {
  flex-grow: 1;
  font-size: 11px;
  font-weight: 500;
}
.issue-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--ink-3);
}
</style>
