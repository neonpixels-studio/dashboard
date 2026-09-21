<template>
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
</template>

<script setup lang="ts">
// The Clerk "USERS & AUTH" panel for AppDetailProduct (issue #20) — split
// out purely to keep the parent template's size/complexity down. Same gap
// as AppDetailProductMoneyHealthPanel.vue: no per-day signup trend or
// sign-in-method split exists on AppDetailResponse, only the rolling
// `users`/`new_users` totals (already wired into the tile grid) — this
// stays static until a dedicated Clerk detail endpoint exists.
import type { DashboardApp } from "~/config/apps";

defineProps<{ app: DashboardApp }>();

const SIGNUPS_PATH =
  "M0 52 C1.7 51.4 6.9 49.2 10.3 48.2 C13.8 47.2 17.3 46.8 20.7 45.9 C24.1 45 27.6 43.7 31 42.7 C34.5 41.7 37.9 40.7 41.4 39.8 C44.9 38.9 48.3 37.1 51.7 37.1 C55.2 37.1 58.6 39.7 62.1 39.7 C65.5 39.7 69 38 72.4 37 C75.9 36 79.3 34.2 82.8 33.7 C86.3 33.2 89.7 34.1 93.1 34.1 C96.5 34.1 100 33.9 103.4 33.5 C106.9 33.1 110.3 32.5 113.8 31.7 C117.3 30.9 120.6 30.1 124.1 28.8 C127.5 27.5 131.1 25.8 134.5 24.1 C137.9 22.4 141.4 19.3 144.8 18.6 C148.3 18 151.8 20 155.2 20.2 C158.6 20.4 162.1 20.2 165.5 19.8 C168.9 19.4 172.5 18 175.9 18 C179.3 18 182.8 19.4 186.2 19.9 C189.6 20.4 193.1 21.8 196.6 21.2 C200.1 20.6 203.5 16.9 206.9 16.3 C210.3 15.7 213.8 16.8 217.2 17.5 C220.6 18.2 224.1 19.9 227.6 20.7 C231.1 21.5 234.4 22.7 237.9 22.4 C241.4 22.1 244.9 20.3 248.3 18.8 C251.8 17.3 255.2 14.9 258.6 13.5 C262.1 12.1 265.6 10.5 269 10.1 C272.4 9.7 275.9 11.2 279.3 10.9 C282.8 10.6 286.3 8.6 289.7 8.1 C293.1 7.6 298.3 8 300 8";
</script>

<style scoped>
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
