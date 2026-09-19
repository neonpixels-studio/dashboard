<template>
  <div class="landing scroll">
    <div class="row between" style="padding: 22px clamp(20px, 5vw, 48px)">
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
    </div>

    <main class="hero">
      <div class="eyebrow">nuxt · tailwind · pinia</div>
      <h1 class="display" style="margin-top: 20px">Dashboard.</h1>
      <p class="lead" style="margin-top: 20px; max-width: 460px">
        A fresh Nuxt app scaffolded to match the house structure. Start building
        from here.
      </p>
      <div class="row wrap gap-3" style="margin-top: 28px">
        <NuxtLink class="btn btn-accent btn-lg" to="/dashboard">
          open dashboard
          <AppIcon name="arrowR" :size="18" />
        </NuxtLink>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const { isDark, toggleTheme } = useTheme();
</script>

<style scoped>
.landing {
  height: 100vh;
  overflow-y: auto;
  background: var(--bg);
}
.hero {
  max-width: 1180px;
  margin: 0 auto;
  padding: clamp(48px, 12vh, 120px) clamp(20px, 5vw, 48px);
}
</style>
