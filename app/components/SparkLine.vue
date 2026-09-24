<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="viewBox"
    preserveAspectRatio="none"
    v-bind="a11yAttrs"
  >
    <line
      v-for="(gridY, index) in gridLines"
      :key="gridY"
      x1="0"
      :y1="gridY"
      :x2="viewWidth"
      :y2="gridY"
      :stroke="gridStroke(index)"
      stroke-width="1"
    />
    <path v-if="filled" :d="fillPath" :fill="fillColor" />
    <path
      :d="path"
      fill="none"
      :stroke="color"
      :stroke-width="strokeWidth"
      vector-effect="non-scaling-stroke"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    path: string;
    width: number | string;
    height: number | string;
    viewBox: string;
    color: string;
    strokeWidth?: number;
    // Closes the line down to the baseline and fills it at low alpha.
    filled?: boolean;
    fillColor?: string;
    // Horizontal gridline y-positions; the last one renders as the baseline.
    gridLines?: number[];
    ariaLabel?: string;
  }>(),
  {
    strokeWidth: 2,
    filled: false,
    gridLines: () => [],
  },
);

const viewWidth = computed(() => Number(props.viewBox.split(" ")[2]));
const viewHeight = computed(() => Number(props.viewBox.split(" ")[3]));

const fillPath = computed(
  () =>
    `${props.path} L${viewWidth.value} ${viewHeight.value} L0 ${viewHeight.value} Z`,
);

const a11yAttrs = computed(() => {
  if (props.ariaLabel) {
    return { role: "img" as const, "aria-label": props.ariaLabel };
  }
  return { "aria-hidden": "true" as const };
});

function gridStroke(index: number): string {
  if (index === props.gridLines.length - 1) {
    return "var(--line)";
  }
  return "var(--line-3)";
}
</script>
