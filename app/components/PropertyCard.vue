<template>
  <NuxtLink
    :to="`/apps/${app.slug}`"
    class="card prop-card"
    :style="{ borderTopColor: app.accent }"
  >
    <div class="head-row">
      <span
        class="status-chip"
        :style="{
          color: app.statusColor,
          background: `color-mix(in srgb, ${app.statusColor} 15%, transparent)`,
        }"
      >
        {{ app.statusLabel }}
      </span>
      <span class="category">{{ app.order }} — {{ app.category }}</span>
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5.5 10.5 10.5 5.5M6.4 5.5h4.1v4.1"
          stroke="#82828F"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <div class="name display-num">
      {{ app.nameBase
      }}<span :style="{ color: app.accent }">{{ app.nameTld }}</span>
    </div>

    <p class="description">{{ app.description }}</p>

    <div class="stats-row">
      <ul class="stats">
        <li v-for="stat in app.stats" :key="stat.label" class="stat">
          <span class="micro-label">{{ stat.label }}</span>
          <span class="stat-value" :style="{ color: statColor(stat) }">
            {{ stat.value }}
          </span>
        </li>
      </ul>
      <span class="grow"></span>
      <SparkLine
        :path="app.sparklinePath"
        :width="120"
        :height="34"
        view-box="0 0 120 34"
        :color="app.accent"
      />
    </div>

    <ul class="chips">
      <li
        v-for="integration in app.integrations"
        :key="integration.label"
        class="chip-tag"
        :class="integration.tone ?? 'default'"
      >
        {{ integration.label }}
      </li>
    </ul>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { AppStat, DashboardApp } from "~/config/apps";

defineProps<{ app: DashboardApp }>();

const STAT_TONE_COLORS: Record<string, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--err)",
};

function statColor(stat: AppStat): string {
  if (!stat.tone) {
    return "var(--ink)";
  }
  return STAT_TONE_COLORS[stat.tone] ?? "var(--ink)";
}
</script>

<style scoped>
.prop-card {
  height: 262px;
  padding: 17px 19px 16px;
  border-top: 2px solid;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.head-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.status-chip {
  padding: 2px 7px;
  border-radius: var(--r-xs);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.category {
  flex-grow: 1;
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}
.name {
  font-size: 28px;
  letter-spacing: -0.035em;
}
.description {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ink-2);
}
.stats-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-top: auto;
}
.stats {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: 16px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stat-value {
  font-family: var(--display);
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.02em;
  line-height: 1;
}
.chips {
  margin: 0;
  padding: 11px 0 0;
  list-style: none;
  display: flex;
  gap: 5px;
  border-top: 1px solid var(--line-3);
}
.chip-tag {
  padding: 2px 6px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-xs);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-2);
}
.chip-tag.danger {
  border-color: color-mix(in srgb, var(--err) 25%, transparent);
  color: var(--err);
}
.chip-tag.warn {
  border-color: color-mix(in srgb, var(--warn) 25%, transparent);
  color: var(--warn);
}
.chip-tag.planned {
  border-style: dashed;
  color: var(--ink-3);
}
</style>
