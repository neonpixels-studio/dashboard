<template>
  <div class="stripe-sentry">
    <div class="card stripe-panel">
      <div class="panel-head">
        <span class="panel-title">Stripe</span>
        <span class="grow"></span>
        <span
          class="sample-chip"
          title="No Stripe detail endpoint exists yet (see PR follow-up)"
        >
          SAMPLE DATA
        </span>
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

    <AppDetailProductSentryPanel :app="app" />
  </div>
</template>

<script setup lang="ts">
// The Stripe/Sentry detail panels for AppDetailProduct (issue #20) — split
// out purely to keep the parent template's size/complexity down. The Sentry
// card is live (AppDetailProductSentryPanel); the Stripe card below is still
// static sample content.
// AppDetailResponse has no per-vendor detail list (transactions, per-plan
// revenue), so there's no real Stripe data to wire here yet; a dedicated
// Stripe detail endpoint would be its own issue.
import type { DashboardApp } from "~/config/apps";

defineProps<{ app: DashboardApp }>();

const MRR_CHART_PATH =
  "M0 69.3 C1.9 69.2 7.8 69.9 11.7 68.6 C15.6 67.3 19.5 61.9 23.4 61.2 C27.3 60.5 31.3 63 35.2 64.5 C39.1 66 43 70.4 46.9 70 C50.8 69.6 54.7 63.2 58.6 62.2 C62.5 61.2 66.4 62.7 70.3 64 C74.2 65.3 78.2 69.7 82.1 69.8 C86 69.9 89.9 65.8 93.8 64.5 C97.7 63.3 101.6 62.3 105.5 62.3 C109.4 62.3 113.3 65.3 117.2 64.7 C121.1 64.1 125.1 58.9 129 58.7 C132.9 58.5 136.8 64 140.7 63.7 C144.6 63.4 148.5 58.2 152.4 57.1 C156.3 56 160.2 58.7 164.1 57.3 C168 55.9 172 52.4 175.9 48.9 C179.8 45.4 183.7 38.3 187.6 36.1 C191.5 33.9 195.4 36 199.3 35.7 C203.2 35.4 207.1 33.6 211 34.1 C214.9 34.6 218.9 39.9 222.8 39 C226.7 38.1 230.6 30.3 234.5 28.8 C238.4 27.3 242.3 29.7 246.2 29.9 C250.1 30.1 254 29.1 257.9 29.9 C261.8 30.7 265.8 35.9 269.7 34.9 C273.6 33.9 277.5 27.5 281.4 23.8 C285.3 20.1 289.2 14.1 293.1 12.8 C297 11.5 300.9 14.5 304.8 16 C308.7 17.5 312.7 22.1 316.6 21.7 C320.5 21.3 324.4 15.8 328.3 13.8 C332.2 11.9 338.1 10.6 340 10";

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
</script>

<style scoped>
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
</style>
