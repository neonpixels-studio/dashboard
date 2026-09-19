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
      <span class="crumb-current">{{ crumb }}</span>
      <span class="grow"></span>
    </template>
    <nav v-else class="top-nav">
      <ul class="nav-list">
        <li><NuxtLink to="/" class="nav-link active">Overview</NuxtLink></li>
        <li><a href="#properties" class="nav-link">Properties</a></li>
        <li><a href="#alerts" class="nav-link">Alerts</a></li>
        <li><a href="#integrations" class="nav-link">Integrations</a></li>
      </ul>
    </nav>

    <button type="button" class="range-btn">
      LAST 30 DAYS
      <svg
        width="9"
        height="6"
        viewBox="0 0 9 6"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M1 1.5L4.5 5L8 1.5"
          stroke="#9A9AA8"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <UserButton
      :appearance="{
        elements: { avatarBox: { width: '32px', height: '32px' } },
      }"
    />
  </header>
</template>

<script setup lang="ts">
defineProps<{ crumb?: string }>();
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
.range-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--line-2);
  background: var(--surface);
  color: var(--ink);
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
