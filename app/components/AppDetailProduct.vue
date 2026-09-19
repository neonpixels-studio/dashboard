<template>
  <div class="detail-body">
    <SectionLabel label="MONEY &amp; HEALTH" meta="STRIPE · SENTRY" />

    <div class="tile-grid">
      <MetricTile
        label="MRR"
        value="$412"
        delta="▲ 6.4%"
        sub="$387 last month"
      />
      <MetricTile
        label="ACTIVE SUBS"
        value="96"
        delta="▲ 7"
        sub="11 trialing · 3 past due"
      />
      <MetricTile
        label="CHURN · 30D"
        value="2.1%"
        delta="▼ 0.4pp"
        sub="2 cancellations"
      />
      <MetricTile
        label="OPEN ISSUES"
        value="3"
        delta="1 new"
        delta-tone="muted"
        sub="0 fatal · 3 error"
        tone="warn"
      />
    </div>

    <div class="stripe-sentry">
      <div class="card stripe-panel">
        <div class="panel-head">
          <span class="panel-title">Stripe</span>
          <span class="level-chip live-chip">LIVE MODE</span>
          <span class="grow"></span>
          <span class="panel-meta">SYNCED 2M AGO</span>
        </div>

        <div class="stripe-charts">
          <div class="mrr-chart">
            <span class="metric-label">MRR · 30 DAYS</span>
            <SparkLine
              :path="MRR_CHART_PATH"
              width="100%"
              :height="80"
              view-box="0 0 340 80"
              :color="app.accent"
              :stroke-width="2.4"
              filled
              :fill-color="`color-mix(in srgb, ${app.accent} 13%, transparent)`"
              :aria-label="`${app.name} monthly recurring revenue over the last 30 days`"
            />
            <AxisRow :labels="['20 AUG', '04 SEP', '19 SEP']" />
          </div>

          <div class="plan-bars">
            <span class="metric-label">REVENUE BY PLAN</span>
            <BarMeter
              label="Pro · $4/mo"
              value="$312"
              pct-label="76%"
              :pct="76"
              :color="app.accent"
            />
            <BarMeter
              label="Lifetime · amortized"
              value="$70"
              pct-label="17%"
              :pct="17"
              :color="app.accent"
            />
            <BarMeter
              label="Supporter · $2/mo"
              value="$30"
              pct-label="7%"
              :pct="7"
              :color="app.accent"
            />
          </div>
        </div>

        <ul class="transactions">
          <li
            v-for="transaction in TRANSACTIONS"
            :key="transaction.email + transaction.date"
            class="transaction"
          >
            <span class="tx-date">{{ transaction.date }}</span>
            <span class="tx-email">{{ transaction.email }}</span>
            <span class="tx-plan" :class="{ warn: transaction.failed }">
              {{ transaction.plan }}
            </span>
            <span class="tx-amount" :class="{ muted: transaction.failed }">
              {{ transaction.amount }}
            </span>
          </li>
        </ul>
      </div>

      <div class="card sentry-panel">
        <div class="panel-head">
          <span class="panel-title">Sentry</span>
          <span class="level-chip warn-chip">3 OPEN</span>
          <span class="grow"></span>
          <a href="#" class="panel-meta">VIEW ALL →</a>
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

    <SectionLabel label="USERS &amp; AUTH" meta="CLERK" class="section-gap" />

    <div class="auth-grid">
      <div class="card auth-card">
        <span class="panel-title">Total users</span>
        <div class="big-value-row">
          <span class="display-num big-value">1,204</span>
          <span class="delta ok">▲ 38 this week</span>
        </div>
        <StatList
          class="auth-list"
          :divided="false"
          :items="[
            { label: 'Verified email', value: '1,147' },
            { label: 'Active last 7d', value: '418' },
            { label: 'Converted to paid', value: '8.0%' },
          ]"
        />
      </div>

      <div class="card auth-card">
        <div class="panel-head">
          <span class="panel-title">Signups</span>
          <span class="panel-meta">DAILY · 30D</span>
        </div>
        <SparkLine
          :path="SIGNUPS_PATH"
          width="100%"
          :height="76"
          view-box="0 0 300 60"
          :color="app.accent"
          :aria-label="`${app.name} daily signups over the last 30 days`"
        />
        <AxisRow :labels="['20 AUG', '04 SEP', '19 SEP']" />
        <div class="card-foot">
          <span class="foot-label">Best day · 16 Sep</span>
          <span class="foot-value">31 signups</span>
        </div>
      </div>

      <div class="card auth-card">
        <span class="panel-title">Sign-in method</span>
        <div class="method-bars">
          <BarMeter
            label="GitHub"
            pct-label="61%"
            :pct="61"
            :color="app.accent"
          />
          <BarMeter
            label="Google"
            pct-label="28%"
            :pct="28"
            :color="app.accent"
          />
          <BarMeter
            label="Email code"
            pct-label="11%"
            :pct="11"
            :color="app.accent"
          />
        </div>
        <div class="card-foot">
          <span class="foot-label">Failed sign-ins · 7d</span>
          <span class="foot-value">14</span>
        </div>
      </div>
    </div>

    <SectionLabel
      label="TRAFFIC"
      meta="GOOGLE ANALYTICS · GA4"
      class="section-gap"
    />

    <TrafficPanel
      :app="app"
      :stats="[
        { label: 'SESSIONS', value: '8,612' },
        { label: 'USERS', value: '5,431' },
        { label: 'AVG TIME', value: '3:18' },
        { label: 'BOUNCE', value: '38%' },
      ]"
      delta="▲ 22% vs prev 30d"
      :path="SESSIONS_PATH"
      :lists="[
        {
          title: 'TOP PAGES',
          items: [
            { label: '/', value: '3,104' },
            { label: '/feed', value: '1,882' },
            { label: '/pricing', value: '1,016' },
            { label: '/sources/add', value: '744' },
            { label: '/docs/import', value: '512' },
          ],
        },
        {
          title: 'TOP REFERRERS',
          items: [
            { label: 'Organic search', value: '41%' },
            { label: 'news.ycombinator', value: '19%' },
            { label: 'bsky.app', value: '14%' },
            { label: 'neonpixels.dev', value: '11%' },
            { label: 'Direct', value: '15%' },
          ],
        },
      ]"
    />

    <SourcesFooter
      :sources="[
        { label: 'GOOGLE ANALYTICS · 4m' },
        { label: 'CLERK · 4m' },
        { label: 'STRIPE · 2m' },
        { label: 'SENTRY · live' },
      ]"
      note="MEDIUM · HASHNODE · DEV.TO · ZYVOP"
      note-tag="NOT USED ON THIS APP"
    />
  </div>
</template>

<script setup lang="ts">
import type { DashboardApp } from "~/config/apps";

defineProps<{ app: DashboardApp }>();

const MRR_CHART_PATH =
  "M0 69.3 C1.9 69.2 7.8 69.9 11.7 68.6 C15.6 67.3 19.5 61.9 23.4 61.2 C27.3 60.5 31.3 63 35.2 64.5 C39.1 66 43 70.4 46.9 70 C50.8 69.6 54.7 63.2 58.6 62.2 C62.5 61.2 66.4 62.7 70.3 64 C74.2 65.3 78.2 69.7 82.1 69.8 C86 69.9 89.9 65.8 93.8 64.5 C97.7 63.3 101.6 62.3 105.5 62.3 C109.4 62.3 113.3 65.3 117.2 64.7 C121.1 64.1 125.1 58.9 129 58.7 C132.9 58.5 136.8 64 140.7 63.7 C144.6 63.4 148.5 58.2 152.4 57.1 C156.3 56 160.2 58.7 164.1 57.3 C168 55.9 172 52.4 175.9 48.9 C179.8 45.4 183.7 38.3 187.6 36.1 C191.5 33.9 195.4 36 199.3 35.7 C203.2 35.4 207.1 33.6 211 34.1 C214.9 34.6 218.9 39.9 222.8 39 C226.7 38.1 230.6 30.3 234.5 28.8 C238.4 27.3 242.3 29.7 246.2 29.9 C250.1 30.1 254 29.1 257.9 29.9 C261.8 30.7 265.8 35.9 269.7 34.9 C273.6 33.9 277.5 27.5 281.4 23.8 C285.3 20.1 289.2 14.1 293.1 12.8 C297 11.5 300.9 14.5 304.8 16 C308.7 17.5 312.7 22.1 316.6 21.7 C320.5 21.3 324.4 15.8 328.3 13.8 C332.2 11.9 338.1 10.6 340 10";

const ERROR_RATE_PATH =
  "M0 33.2 C1.7 32.3 6.9 27.9 10.3 27.7 C13.8 27.5 17.3 29.9 20.7 32.1 C24.1 34.4 27.6 40.5 31 41.2 C34.5 41.9 37.9 37.8 41.4 36.1 C44.9 34.4 48.3 34 51.7 30.9 C55.2 27.8 58.6 20.5 62.1 17.6 C65.5 14.7 69 14.5 72.4 13.4 C75.9 12.3 79.3 12.2 82.8 11.3 C86.3 10.4 89.7 5.4 93.1 8 C96.5 10.6 100 22.8 103.4 27.1 C106.9 31.5 110.3 35.3 113.8 34.1 C117.3 32.9 120.6 21.7 124.1 19.9 C127.5 18.1 131.1 20.8 134.5 23.3 C137.9 25.9 141.4 33.5 144.8 35.2 C148.3 36.9 151.8 33.9 155.2 33.5 C158.6 33.1 162.1 31.9 165.5 32.7 C168.9 33.6 172.5 37.8 175.9 38.6 C179.3 39.4 182.8 38.1 186.2 37.7 C189.6 37.3 193.1 36.5 196.6 36 C200.1 35.5 203.5 34.8 206.9 34.9 C210.3 35 213.8 38.9 217.2 36.8 C220.6 34.7 224.1 23.3 227.6 22.1 C231.1 20.9 234.4 27.3 237.9 29.8 C241.4 32.3 244.9 36.3 248.3 37.1 C251.8 37.9 255.2 34.8 258.6 34.5 C262.1 34.2 265.6 32.4 269 35.3 C272.4 38.2 275.9 51.5 279.3 52 C282.8 52.5 286.3 42.9 289.7 38.3 C293.1 33.7 298.3 26.6 300 24.3";

const SIGNUPS_PATH =
  "M0 52 C1.7 51.4 6.9 49.2 10.3 48.2 C13.8 47.2 17.3 46.8 20.7 45.9 C24.1 45 27.6 43.7 31 42.7 C34.5 41.7 37.9 40.7 41.4 39.8 C44.9 38.9 48.3 37.1 51.7 37.1 C55.2 37.1 58.6 39.7 62.1 39.7 C65.5 39.7 69 38 72.4 37 C75.9 36 79.3 34.2 82.8 33.7 C86.3 33.2 89.7 34.1 93.1 34.1 C96.5 34.1 100 33.9 103.4 33.5 C106.9 33.1 110.3 32.5 113.8 31.7 C117.3 30.9 120.6 30.1 124.1 28.8 C127.5 27.5 131.1 25.8 134.5 24.1 C137.9 22.4 141.4 19.3 144.8 18.6 C148.3 18 151.8 20 155.2 20.2 C158.6 20.4 162.1 20.2 165.5 19.8 C168.9 19.4 172.5 18 175.9 18 C179.3 18 182.8 19.4 186.2 19.9 C189.6 20.4 193.1 21.8 196.6 21.2 C200.1 20.6 203.5 16.9 206.9 16.3 C210.3 15.7 213.8 16.8 217.2 17.5 C220.6 18.2 224.1 19.9 227.6 20.7 C231.1 21.5 234.4 22.7 237.9 22.4 C241.4 22.1 244.9 20.3 248.3 18.8 C251.8 17.3 255.2 14.9 258.6 13.5 C262.1 12.1 265.6 10.5 269 10.1 C272.4 9.7 275.9 11.2 279.3 10.9 C282.8 10.6 286.3 8.6 289.7 8.1 C293.1 7.6 298.3 8 300 8";

const SESSIONS_PATH =
  "M0 14 C5 16.2 19.8 23.7 29.7 27.1 C39.6 30.5 49.4 32 59.3 34.2 C69.2 36.4 79.1 37 89 40.5 C98.9 44 108.7 51.1 118.6 55.3 C128.5 59.5 138.4 62.3 148.3 65.8 C158.2 69.3 168 75 177.9 76.2 C187.8 77.5 197.7 76.4 207.6 73.3 C217.5 70.2 227.3 58.3 237.2 57.4 C247.1 56.5 257 68.4 266.9 67.7 C276.8 67 286.7 54.1 296.6 53.4 C306.5 52.7 316.3 61.4 326.2 63.4 C336.1 65.4 346 63.9 355.9 65.6 C365.8 67.3 375.6 70.7 385.5 73.8 C395.4 76.9 405.3 84.4 415.2 84.3 C425.1 84.2 434.9 75.8 444.8 73.1 C454.7 70.4 464.6 71.2 474.5 68.1 C484.4 65 494.2 56.4 504.1 54.7 C514 53 523.9 58.7 533.8 57.7 C543.7 56.7 553.5 51.2 563.4 48.9 C573.3 46.6 583.2 42.9 593.1 43.9 C603 44.9 612.9 52.9 622.8 54.8 C632.7 56.7 642.5 53.9 652.4 55.4 C662.3 56.9 672.2 62.3 682.1 63.9 C692 65.5 701.8 62.9 711.7 65 C721.6 67.1 731.5 72.7 741.4 76.6 C751.3 80.5 761.1 83.8 771 88.4 C780.9 93 790.8 98.7 800.7 104 C810.6 109.3 820.4 114.7 830.3 120 C840.2 125.3 855 133.3 860 136";

const TRANSACTIONS = [
  {
    date: "19 SEP",
    email: "m••••a@hey.com",
    plan: "Pro · monthly",
    amount: "+$4.00",
    failed: false,
  },
  {
    date: "19 SEP",
    email: "j••••n@fastmail.com",
    plan: "Lifetime",
    amount: "+$49.00",
    failed: false,
  },
  {
    date: "18 SEP",
    email: "s••••e@gmail.com",
    plan: "Pro · monthly",
    amount: "+$4.00",
    failed: false,
  },
  {
    date: "18 SEP",
    email: "r••••t@proton.me",
    plan: "Payment failed",
    amount: "—$4.00",
    failed: true,
  },
];

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
.detail-body {
  flex-grow: 1;
  padding: 24px 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.section-gap {
  margin-top: 8px;
}
.tile-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.stripe-sentry {
  display: flex;
  gap: 16px;
}
.stripe-panel {
  flex: 3;
  min-width: 0;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
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
.live-chip {
  color: var(--ok);
  background: var(--ok-tint);
}
.warn-chip {
  color: var(--warn);
  background: var(--warn-tint);
}
.stripe-charts {
  display: flex;
  gap: 26px;
}
.mrr-chart {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plan-bars {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.transactions {
  margin: 0;
  padding: 4px 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line-3);
}
.transaction {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
}
.transaction:not(:last-child) {
  border-bottom: 1px solid var(--line-3);
}
.tx-date {
  width: 66px;
  font-size: 10px;
  color: var(--ink-3);
}
.tx-email {
  flex-grow: 1;
  font-size: 11px;
}
.tx-plan {
  width: 130px;
  font-size: 11px;
  color: var(--ink-2);
}
.tx-plan.warn {
  color: var(--warn);
}
.tx-amount {
  width: 96px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  color: var(--ok);
}
.tx-amount.muted {
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
.auth-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.auth-card {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.big-value-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.big-value {
  font-size: 40px;
}
.big-value-row .delta {
  padding-bottom: 5px;
}
.auth-list {
  margin-top: auto;
}
.method-bars {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.card-foot {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--line-3);
}
.foot-label {
  flex-grow: 1;
  font-size: 11px;
  color: var(--ink-2);
}
.foot-value {
  font-size: 11px;
  font-weight: 600;
}
</style>
