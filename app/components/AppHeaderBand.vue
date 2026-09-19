<template>
  <div class="header-band">
    <BrandMark v-if="app.isStudioSite" :size="26" />
    <div
      v-else
      class="accent-bar"
      :style="{ background: app.accent }"
      aria-hidden="true"
    ></div>

    <div class="title-wrap">
      <h1 class="app-title display-num">
        {{ app.nameBase
        }}<span :style="{ color: app.accent }">{{ app.nameTld }}</span>
      </h1>
      <p class="tagline">{{ app.tagline }}</p>
    </div>

    <span
      class="status-chip"
      :style="{
        color: app.statusColor,
        background: `color-mix(in srgb, ${app.statusColor} 15%, transparent)`,
      }"
    >
      {{ app.statusLabel }}
    </span>

    <span class="grow"></span>

    <a
      v-for="link in secondaryLinks"
      :key="link"
      href="#"
      class="secondary-btn"
    >
      {{ link }}
    </a>

    <a
      :href="app.url"
      target="_blank"
      rel="noopener"
      class="open-btn"
      :style="{ background: app.isStudioSite ? 'var(--ink)' : app.accent }"
    >
      Open {{ app.name }}
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5.5 10.5 10.5 5.5M6.4 5.5h4.1v4.1"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </a>
  </div>
</template>

<script setup lang="ts">
import type { DashboardApp } from "~/config/apps";

withDefaults(defineProps<{ app: DashboardApp; secondaryLinks?: string[] }>(), {
  secondaryLinks: () => [],
});
</script>

<style scoped>
.header-band {
  flex-shrink: 0;
  padding: 24px 32px 22px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-2);
  display: flex;
  align-items: center;
  gap: 18px;
}
.accent-bar {
  width: 3px;
  height: 46px;
  border-radius: 2px;
}
.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.app-title {
  margin: 0;
  font-size: 36px;
  letter-spacing: -0.04em;
}
.tagline {
  margin: 0;
  font-size: 11px;
  color: var(--ink-2);
}
.status-chip {
  padding: 3px 9px;
  border-radius: var(--r-sm);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  align-self: flex-start;
}
.secondary-btn {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  font-size: 12px;
  color: var(--ink-2);
  display: flex;
  align-items: center;
}
.secondary-btn:hover {
  color: var(--ink);
}
.open-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: var(--r);
  color: var(--bg);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
