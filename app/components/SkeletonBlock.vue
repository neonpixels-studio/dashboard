<template>
  <span
    class="skeleton-block"
    :style="{ width, height, borderRadius: radius }"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: string;
    height?: string;
    radius?: string;
  }>(),
  {
    width: "100%",
    height: "1em",
    radius: "var(--r-xs)",
  },
);
</script>

<style scoped>
.skeleton-block {
  display: inline-block;
  background: linear-gradient(
    90deg,
    var(--line-3) 0%,
    var(--line-2) 50%,
    var(--line-3) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-block {
    animation: none;
    background: var(--line-2);
  }
}
</style>
