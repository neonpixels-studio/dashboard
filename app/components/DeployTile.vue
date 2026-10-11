<template>
  <component
    :is="tile.href ? 'a' : 'div'"
    class="card deploy-tile"
    :class="tile.tone"
    v-bind="linkAttributes"
  >
    <div class="tile-head">
      <AppIcon
        v-if="iconName"
        :name="iconName"
        :size="12"
        :stroke-width="1.5"
      />
      <span class="tile-label">DEPLOY</span>
      <span class="tile-meta">NETLIFY · PRODUCTION</span>
    </div>
    <span class="value display-num">{{ tile.value }}</span>
    <time
      v-if="tile.finishedAt"
      class="sub"
      :datetime="tile.finishedAt"
      :title="tile.fullTime ?? undefined"
      >{{ tile.sub }}</time
    >
    <span v-else class="sub">{{ tile.sub }}</span>
  </component>
</template>

<script setup lang="ts">
import type { AppDeploy } from "#shared/types/dashboard";
import { buildDeployTileData } from "~/utils/deployTile";

const props = defineProps<{ deploy: AppDeploy; appUrl: string }>();

const TONE_ICONS = {
  warn: "triangle",
  danger: "triangle",
  ok: "checkCircle",
} as const;

const tile = computed(() => buildDeployTileData(props.deploy, props.appUrl));

const iconName = computed(() =>
  tile.value.tone ? TONE_ICONS[tile.value.tone] : undefined,
);

const linkAttributes = computed(() =>
  tile.value.href
    ? { href: tile.value.href, target: "_blank", rel: "noopener noreferrer" }
    : {},
);
</script>

<style scoped>
.deploy-tile {
  padding: 17px 19px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: inherit;
  text-decoration: none;
}
a.deploy-tile:hover {
  border-color: var(--ink-3);
}
.deploy-tile.warn {
  border-color: color-mix(in srgb, var(--warn) 25%, transparent);
}
.deploy-tile.danger {
  border-color: color-mix(in srgb, var(--err) 25%, transparent);
}
.deploy-tile.ok {
  border-color: color-mix(in srgb, var(--ok) 20%, transparent);
}
.tile-head {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-2);
}
.deploy-tile.warn .tile-head {
  color: var(--warn);
}
.deploy-tile.danger .tile-head {
  color: var(--err);
}
.deploy-tile.ok .tile-head {
  color: var(--ok);
}
.tile-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
}
.tile-meta {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}
.value {
  font-size: 34px;
}
.sub {
  font-size: 10px;
  color: var(--ink-3);
  margin-top: 2px;
}
</style>
