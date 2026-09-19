<template>
  <div class="bar-meter">
    <div class="bar-head">
      <span
        v-if="swatch"
        class="swatch"
        :style="{ background: color }"
        aria-hidden="true"
      ></span>
      <span class="label">{{ label }}</span>
      <span v-if="value" class="value">{{ value }}</span>
      <span v-if="pctLabel" class="pct">{{ pctLabel }}</span>
    </div>
    <div class="track">
      <div class="fill" :style="{ width: `${pct}%`, background: color }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  pct: number;
  color: string;
  value?: string;
  pctLabel?: string;
  swatch?: boolean;
}>();
</script>

<style scoped>
.bar-meter {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.bar-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.bar-head .swatch {
  align-self: center;
}
.label {
  flex-grow: 1;
  font-size: 11px;
}
.value {
  font-size: 11px;
  font-weight: 600;
}
.pct {
  width: 42px;
  text-align: right;
  font-size: 10px;
  color: var(--ink-3);
}
.track {
  height: 8px;
  border-radius: 4px;
  background: var(--line-3);
}
.fill {
  height: 8px;
  border-radius: 0 4px 4px 0;
}
</style>
