<template>
  <NuxtLink
    :to="`/apps/${app.slug}`"
    class="card prop-card"
    :style="{ borderTopColor: app.accent }"
    :aria-busy="isLoading"
  >
    <div class="head-row">
      <span
        v-if="app.card"
        class="status-chip"
        :style="healthToneChipStyle(app.card.status.tone)"
      >
        {{ app.card.status.label }}
      </span>
      <span
        v-else-if="hasError"
        class="status-chip"
        :style="healthToneChipStyle('danger')"
      >
        ERROR
      </span>
      <SkeletonBlock
        v-else-if="isPending"
        width="52px"
        height="16px"
        radius="var(--r-xs)"
      />
      <!-- The fetch resolved with no row for this slug (never fabricated —
           see app.card's own doc comment) — distinct from `isPending` so
           the chip doesn't skeleton-load forever once the fetch settles. -->
      <span v-else class="status-chip" :style="healthToneChipStyle('muted')">
        NO DATA
      </span>
      <span class="category">{{ app.order }} — {{ app.category }}</span>
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5.5 10.5 10.5 5.5M6.4 5.5h4.1v4.1"
          stroke="#82828F"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <div class="name display-num">
      {{ app.nameBase
      }}<span :style="{ color: app.accent }">{{ app.nameTld }}</span>
    </div>

    <p class="description">{{ app.description }}</p>

    <PropertyCardMetrics
      :card="app.card"
      :has-error="hasError"
      :is-pending="isPending"
      :accent="app.accent"
      :app-name="app.name"
    />

    <ul v-if="app.card" class="chips">
      <li
        v-for="integration in app.card.integrations"
        :key="integration.vendor"
        class="chip-tag"
        :class="integrationHealthTone(integration)"
      >
        {{ integrationChipLabel(integration) }}
      </li>
    </ul>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { AppCardViewModel } from "~/utils/appViewModel";
import {
  integrationChipLabel,
  isCardLoading,
} from "~/utils/propertyCardMetrics";
import {
  healthToneChipStyle,
  integrationHealthTone,
} from "~/utils/statusColor";

const props = defineProps<{
  app: AppCardViewModel;
  // True while the studio-wide GET /api/apps fetch that would have
  // populated `app.card` has failed. Only rendered when `app.card` is still
  // null — a card that loaded once and then failed a later refresh keeps
  // showing its last known data instead, same as DataErrorState's own
  // "showing the last known state" behavior for the overview rollups.
  hasError?: boolean;
  // True while that fetch is still in flight. Distinguishes "still
  // loading" (show the skeleton) from "resolved successfully with no row
  // for this slug" (show an honest empty state) — without it, a property
  // with nothing synced yet would skeleton-load forever.
  isPending?: boolean;
}>();

const isLoading = computed(() =>
  isCardLoading(props.app.card, props.hasError, props.isPending),
);
</script>

<style scoped>
.prop-card {
  height: 262px;
  padding: 17px 19px 16px;
  border-top: 2px solid;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.head-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.status-chip {
  padding: 2px 7px;
  border-radius: var(--r-xs);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.category {
  flex-grow: 1;
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}
.name {
  font-size: 28px;
  letter-spacing: -0.035em;
}
.description {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ink-2);
}
.chips {
  margin: 0;
  padding: 11px 0 0;
  list-style: none;
  display: flex;
  gap: 5px;
  border-top: 1px solid var(--line-3);
}
.chip-tag {
  padding: 2px 6px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-xs);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-2);
}
.chip-tag.danger {
  border-color: color-mix(in srgb, var(--err) 25%, transparent);
  color: var(--err);
}
.chip-tag.warn {
  border-color: color-mix(in srgb, var(--warn) 25%, transparent);
  color: var(--warn);
}
.chip-tag.muted {
  border-style: dashed;
  color: var(--ink-3);
}
</style>
