<template>
  <div class="section-label">
    <span class="dash" aria-hidden="true"></span>
    <span class="label">{{ label }}</span>
    <span class="grow"></span>
    <span v-if="meta" class="meta">{{ meta }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; meta?: string }>();
</script>

<style scoped>
.section-label {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.dash {
  width: 22px;
  height: 1px;
  background: var(--ink-3);
  align-self: center;
}
.label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--ink-2);
}
.meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
</style>
