<template>
  <div class="card methods-card">
    <PanelHead title="Sign-in method" />
    <div class="method-bars">
      <BarMeter
        v-for="method in methods"
        :key="method.label"
        :label="method.label"
        :pct-label="method.pctLabel"
        :pct="method.pct"
        :color="color"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthMethodShare } from "~/utils/authPanel";

defineProps<{ methods: AuthMethodShare[]; color: string }>();
</script>

<style scoped>
.methods-card {
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.method-bars {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
</style>
