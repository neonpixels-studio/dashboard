<template>
  <div class="panel-head">
    <span class="panel-title">{{ title }}</span>
    <span v-if="meta" class="panel-meta">{{ meta }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; meta?: string }>();
</script>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.panel-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
</style>
