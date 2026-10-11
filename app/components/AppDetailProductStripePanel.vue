<template>
  <div class="card stripe-panel">
    <div class="panel-head">
      <span class="panel-title">Stripe</span>
      <span v-if="stripe.environment === 'development'" class="env-chip">
        development
      </span>
      <span class="grow"></span>
      <a
        v-if="stripe.dashboardUrl"
        class="stripe-link"
        :href="stripe.dashboardUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in Stripe ↗
      </a>
    </div>

    <p v-if="stripe.isEmpty" class="empty-state">
      No Stripe subscriptions or activity yet.
    </p>

    <template v-else>
      <div class="stripe-charts">
        <div class="mrr-chart">
          <span class="metric-label">MRR · {{ MRR_WINDOW_DAYS }} DAYS</span>
          <template v-if="stripe.mrrPath">
            <SparkLine
              :path="stripe.mrrPath"
              width="100%"
              :height="80"
              :view-box="`0 0 ${MRR_CHART_VIEWBOX_WIDTH} ${MRR_CHART_VIEWBOX_HEIGHT}`"
              :color="app.accent"
              :stroke-width="2.4"
              filled
              :fill-color="`color-mix(in srgb, ${app.accent} 13%, transparent)`"
              :aria-label="`${app.name} monthly recurring revenue over the last ${MRR_WINDOW_DAYS} days`"
            />
            <AxisRow :labels="stripe.mrrAxisLabels" />
          </template>
          <p v-else class="section-empty">Not enough MRR history yet.</p>
        </div>

        <div class="plan-bars">
          <span class="metric-label">REVENUE BY PLAN</span>
          <BarMeter
            v-for="plan in stripe.plans"
            :key="plan.key"
            :label="plan.label"
            :value="plan.value"
            :pct-label="plan.pctLabel"
            :pct="plan.pct"
            :color="app.accent"
          />
          <p v-if="!stripe.plans.length" class="section-empty">
            No active subscriptions.
          </p>
        </div>
      </div>

      <StripeEventList :events="stripe.events" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AppDetailViewModel } from "~/utils/appViewModel";
import {
  MRR_CHART_VIEWBOX_HEIGHT,
  MRR_CHART_VIEWBOX_WIDTH,
  MRR_WINDOW_DAYS,
  buildStripePanelData,
} from "~/utils/stripePanel";

const props = defineProps<{ app: AppDetailViewModel }>();

const stripe = computed(() => buildStripePanelData(props.app.detail));
</script>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.stripe-panel {
  flex: 3;
  min-width: 0;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
.stripe-link {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--ink-2);
  text-decoration: none;
}
.stripe-link:hover,
.stripe-link:focus-visible {
  text-decoration: underline;
}
.empty-state,
.section-empty {
  margin: 0;
  font-size: 11px;
  color: var(--ink-3);
}
</style>
