<template>
  <div class="card">
    <PanelHead title="Signups" meta="DAILY · 30D" />
    <SparkLine
      :path="path"
      width="100%"
      :height="76"
      :view-box="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`"
      :color="color"
      :aria-label="`${appName} daily signups over the last 30 days`"
    />
    <AxisRow :labels="axisLabels" />
    <div v-if="signups.bestDayLabel" class="card-foot">
      <span class="foot-label">Best day · {{ signups.bestDayLabel }}</span>
      <span class="foot-value">
        {{ formatCount(signups.bestDayCount) }} signups
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthSignups } from "~/utils/authPanel";
import { formatCount } from "~/utils/rollupFormat";
import { buildAxisLabels, buildSparklinePath } from "~/utils/sparklinePath";

const VIEWBOX_WIDTH = 300;
const VIEWBOX_HEIGHT = 60;

const props = defineProps<{
  signups: AuthSignups;
  appName: string;
  color: string;
}>();

const path = computed(() =>
  buildSparklinePath(props.signups.points, VIEWBOX_WIDTH, VIEWBOX_HEIGHT),
);
const axisLabels = computed(() => buildAxisLabels(props.signups.points));
</script>

<style scoped>
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
