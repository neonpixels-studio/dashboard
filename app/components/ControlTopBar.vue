<template>
  <header class="top-bar">
    <NuxtLink to="/" class="brand">
      <BrandMark :size="18" />
      <span class="brand-name">NEONPIXELS</span>
      <span v-if="!crumb" class="brand-sub">CONTROL</span>
    </NuxtLink>

    <template v-if="crumb">
      <span class="crumb-sep" aria-hidden="true">/</span>
      <NuxtLink to="/" class="crumb-link">All properties</NuxtLink>
      <span class="crumb-sep" aria-hidden="true">/</span>
      <PropertySwitcher
        v-if="crumbSlug"
        :current-slug="crumbSlug"
        :current-name="crumb"
      />
      <span v-else class="crumb-current">{{ crumb }}</span>
      <span class="grow"></span>
    </template>
    <nav v-else class="top-nav">
      <ul class="nav-list">
        <li><NuxtLink to="/" class="nav-link active">Overview</NuxtLink></li>
        <li><a href="#properties" class="nav-link">Properties</a></li>
        <li><a href="#alerts" class="nav-link">Alerts</a></li>
      </ul>
    </nav>

    <OverviewRangeSelector
      v-if="range !== undefined"
      :model-value="range"
      @update:model-value="emit('update:range', $event)"
    />

    <UserButton
      sign-out-redirect-url="/login"
      :appearance="{
        elements: { avatarBox: { width: '32px', height: '32px' } },
      }"
    />
  </header>
</template>

<script setup lang="ts">
import type { OverviewRangeDays } from "#shared/constants/overviewRange";

// `range` is only passed on the overview, where it drives the rollups; the
// detail pages leave it unset and the selector is hidden.
defineProps<{
  crumb?: string;
  crumbSlug?: string;
  range?: OverviewRangeDays;
}>();
const emit = defineEmits<{ "update:range": [days: OverviewRangeDays] }>();
</script>

<style scoped>
.top-bar {
  height: 64px;
  flex-shrink: 0;
  padding: 0 32px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 20px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-name {
  font-family: var(--display);
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.01em;
}
.brand-sub {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}
.crumb-sep {
  font-size: 12px;
  color: var(--line-2);
}
.crumb-link {
  font-size: 12px;
  color: var(--ink-2);
}
.crumb-link:hover {
  color: var(--ink);
}
.crumb-current {
  font-size: 12px;
  font-weight: 600;
}
.top-nav {
  flex-grow: 1;
}
.nav-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.nav-link {
  display: inline-block;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ink-2);
}
.nav-link:hover {
  color: var(--ink);
}
.nav-link.active {
  background: var(--surface-2);
  color: var(--ink);
  font-weight: 600;
}
</style>
