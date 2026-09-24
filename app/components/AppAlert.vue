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
type Tone = "err" | "warn" | "ok" | "info";

const ICON_BY_TONE: Record<Tone, string> = {
  err: "triangle",
  warn: "triangle",
  ok: "checkCircle",
  info: "info",
};

const LABEL_BY_TONE: Record<Tone, string> = {
  err: "Error",
  warn: "Warning",
  ok: "Success",
  info: "Info",
};

const props = withDefaults(
  defineProps<{
    tone?: Tone;
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

const iconName = computed(() => ICON_BY_TONE[props.tone]);
const toneLabel = computed(() => LABEL_BY_TONE[props.tone]);
</script>
