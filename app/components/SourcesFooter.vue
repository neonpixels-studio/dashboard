<template>
  <div class="sources-footer">
    <span class="label">SOURCES</span>
    <ul class="sources">
      <li
        v-for="source in chips"
        :key="source.label"
        class="source-chip"
        :class="source.tone"
      >
        <span class="dot" aria-hidden="true"></span>
        {{ source.label }}
      </li>
    </ul>
    <span class="grow"></span>
    <span v-if="note" class="note">{{ note }}</span>
    <span v-if="noteTag" class="note-tag">{{ noteTag }}</span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  sources: { label: string; tone?: "ok" | "warn" }[];
  note?: string;
  noteTag?: string;
}>();

const chips = computed(() =>
  props.sources.map((source) => ({
    label: source.label,
    tone: source.tone ?? "ok",
  })),
);
</script>

<style scoped>
.sources-footer {
  padding: 14px 20px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
}
.label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink-3);
  margin-right: 6px;
}
.sources {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 10px;
}
.source-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ink-2);
}
.source-chip .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.source-chip.warn {
  border-color: color-mix(in srgb, var(--warn) 25%, transparent);
  color: var(--warn);
}
.source-chip.warn .dot {
  background: var(--warn);
}
.note {
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
}
.note-tag {
  padding: 4px 9px;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-sm);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
}
</style>
