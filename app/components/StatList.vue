<template>
  <ul class="stat-list" :class="{ divided }">
    <li v-for="row in rows" :key="row.label" class="stat-row">
      <span
        v-if="row.marker"
        :class="row.marker.kind"
        :style="row.marker.style"
      >
        {{ row.marker.text }}
      </span>
      <span class="label" :class="{ muted: row.muted }">{{ row.label }}</span>
      <span class="value">{{ row.value }}</span>
      <span v-if="row.delta" class="row-delta" :class="row.deltaClass">
        {{ row.delta }}
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
interface StatListItem {
  label: string;
  value: string;
  swatch?: string;
  chip?: { label: string; color: string };
  delta?: string;
  deltaTone?: "ok" | "muted";
  muted?: boolean;
}

interface RowMarker {
  // Both kinds are global utility classes from main.css.
  kind: "swatch" | "level-chip";
  text: string;
  style: Record<string, string>;
}

const props = withDefaults(
  defineProps<{
    items: StatListItem[];
    // Draws a hairline under every row but the last.
    divided?: boolean;
  }>(),
  { divided: true },
);

function markerFor(item: StatListItem): RowMarker | undefined {
  if (item.chip) {
    return {
      kind: "level-chip",
      text: item.chip.label,
      style: {
        color: item.chip.color,
        background: `color-mix(in srgb, ${item.chip.color} 15%, transparent)`,
      },
    };
  }
  if (item.swatch) {
    return { kind: "swatch", text: "", style: { background: item.swatch } };
  }
  return undefined;
}

const rows = computed(() =>
  props.items.map((item) => ({
    label: item.label,
    value: item.value,
    muted: item.muted ?? false,
    delta: item.delta,
    deltaClass: item.deltaTone ?? "ok",
    marker: markerFor(item),
  })),
);
</script>

<style scoped>
.stat-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.stat-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 0;
}
.divided .stat-row:not(:last-child) {
  border-bottom: 1px solid var(--line-3);
}
.label {
  flex-grow: 1;
  font-size: 11px;
  color: var(--ink-2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.label.muted {
  color: var(--ink-3);
}
.value {
  font-size: 11px;
  font-weight: 600;
}
.row-delta {
  width: 52px;
  text-align: right;
  font-size: 10px;
  font-weight: 600;
}
.row-delta.ok {
  color: var(--ok);
}
.row-delta.muted {
  color: var(--ink-2);
}
</style>
