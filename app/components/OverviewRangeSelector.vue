<template>
  <ul class="range-selector" aria-label="Date range">
    <li v-for="days in OVERVIEW_RANGE_OPTIONS" :key="days">
      <button
        type="button"
        class="range-option"
        :class="{ active: days === modelValue }"
        :aria-pressed="days === modelValue"
        @click="emit('update:modelValue', days)"
      >
        {{ days }}D<span class="sr-only"> (last {{ days }} days)</span>
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
import {
  OVERVIEW_RANGE_OPTIONS,
  type OverviewRangeDays,
} from "#shared/constants/overviewRange";

defineProps<{ modelValue: OverviewRangeDays }>();
const emit = defineEmits<{ "update:modelValue": [days: OverviewRangeDays] }>();
</script>

<style scoped>
.range-selector {
  margin: 0;
  padding: 2px;
  list-style: none;
  display: flex;
  gap: 2px;
  border: 1px solid var(--line-2);
  background: var(--surface);
  border-radius: 6px;
}
.range-option {
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ink-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.range-option:hover {
  color: var(--ink);
}
.range-option.active {
  background: var(--surface-2);
  color: var(--ink);
  font-weight: 600;
}
</style>
