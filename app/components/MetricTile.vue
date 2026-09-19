<template>
  <div class="card tile" :class="tone">
    <div class="tile-head">
      <AppIcon
        v-if="iconName"
        :name="iconName"
        :size="12"
        :stroke-width="1.5"
      />
      <span class="tile-label">{{ label }}</span>
    </div>
    <div class="value-row">
      <span class="value display-num">{{ value }}</span>
      <span class="delta" :class="deltaTone">{{ delta }}</span>
    </div>
    <div class="sub">{{ sub }}</div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    delta: string;
    sub: string;
    deltaTone?: "ok" | "muted";
    // Tints the label, icon, and card border for health tiles.
    tone?: "warn" | "danger" | "ok";
  }>(),
  { deltaTone: "ok" },
);

const TONE_ICONS = {
  warn: "triangle",
  danger: "triangle",
  ok: "checkCircle",
} as const;

const iconName = computed(() =>
  props.tone ? TONE_ICONS[props.tone] : undefined,
);
</script>

<style scoped>
.tile {
  padding: 17px 19px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tile.warn {
  border-color: color-mix(in srgb, var(--warn) 25%, transparent);
}
.tile.danger {
  border-color: color-mix(in srgb, var(--err) 25%, transparent);
}
.tile.ok {
  border-color: color-mix(in srgb, var(--ok) 20%, transparent);
}
.tile-head {
  display: flex;
  align-items: center;
  gap: 7px;
}
.tile.warn .tile-head {
  color: var(--warn);
}
.tile.danger .tile-head {
  color: var(--err);
}
.tile.ok .tile-head {
  color: var(--ok);
}
.tile-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink-2);
}
.tile.warn .tile-label,
.tile.danger .tile-label,
.tile.ok .tile-label {
  color: inherit;
}
.value-row {
  display: flex;
  align-items: flex-end;
  gap: 9px;
}
.value {
  font-size: 34px;
}
.value-row .delta {
  padding-bottom: 4px;
}
.delta.muted {
  color: var(--ink-2);
}
.sub {
  font-size: 10px;
  color: var(--ink-3);
  margin-top: 2px;
}
</style>
