<template>
  <div :class="['alert', tone]" role="alert">
    <AppIcon :name="iconName" :size="18" cls="a-ico" />
    <div class="a-body">
      <div class="a-title">{{ title || toneLabel }}</div>
      <div class="a-text">
        <slot />
      </div>
    </div>
    <button v-if="closeable" class="icon-btn a-close" @click="emit('close')">
      <AppIcon name="x" :size="15" />
    </button>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    tone?: "err" | "warn" | "ok" | "info";
    title?: string;
    closeable?: boolean;
  }>(),
  {
    tone: "info",
    closeable: false,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const iconName = computed(() => {
  const map: Record<string, string> = {
    err: "triangle",
    warn: "triangle",
    ok: "checkCircle",
    info: "info",
  };
  return map[props.tone];
});

const toneLabel = computed(() => {
  const map: Record<string, string> = {
    err: "Error",
    warn: "Warning",
    ok: "Success",
    info: "Info",
  };
  return map[props.tone];
});
</script>
