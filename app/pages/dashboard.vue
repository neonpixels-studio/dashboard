<template>
  <div class="app scroll">
    <header class="row between" style="padding: 20px clamp(20px, 5vw, 40px)">
      <span class="mono" style="font-weight: 700; font-size: 18px">
        dashboard
      </span>
      <button
        class="icon-btn"
        :title="isDark ? 'Light' : 'Dark'"
        @click="toggleTheme"
      >
        <AppIcon :name="isDark ? 'sun' : 'moon'" :size="18" />
      </button>
    </header>

    <main
      style="
        max-width: 1180px;
        margin: 0 auto;
        padding: 24px clamp(20px, 5vw, 40px);
      "
    >
      <div class="eyebrow">workspace</div>
      <h1 class="h1" style="margin-top: 12px">Dashboard</h1>
      <p class="lead" style="margin-top: 10px">Build your dashboard here.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
const { isDark, toggleTheme } = useTheme();
</script>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--bg);
}
</style>
