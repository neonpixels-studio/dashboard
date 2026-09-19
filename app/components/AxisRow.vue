<template>
  <div class="axis-row">
    <span v-for="label in labels" :key="label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ labels?: string[] }>(), {
  labels: () => ["20 AUG", "27 AUG", "03 SEP", "10 SEP", "19 SEP"],
});
</script>

<style scoped>
.axis-row {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
</style>
