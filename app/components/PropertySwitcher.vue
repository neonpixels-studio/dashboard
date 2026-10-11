<template>
  <div ref="rootRef" class="switcher">
    <button
      ref="triggerRef"
      type="button"
      class="switcher-trigger"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? menuId : undefined"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="switcher-name">{{ currentName }}</span>
      <svg
        class="switcher-icon"
        width="10"
        height="14"
        viewBox="0 0 10 14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 5l3-3 3 3M2 9l3 3 3-3" />
      </svg>
    </button>

    <div v-if="isOpen" class="switcher-panel">
      <ul
        :id="menuId"
        ref="menuRef"
        class="switcher-menu"
        role="menu"
        aria-label="Switch property"
        @keydown="onMenuKeydown"
      >
        <li v-for="item in items" :key="item.slug" role="none">
          <NuxtLink
            :to="item.to"
            class="switcher-item"
            role="menuitem"
            :aria-current="item.current ? 'page' : undefined"
            @click="close()"
          >
            <span
              class="switcher-swatch"
              :style="{ background: item.accent }"
              aria-hidden="true"
            ></span>
            <span class="switcher-item-name">{{ item.name }}</span>
            <svg
              v-if="item.current"
              class="switcher-check"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2 6.5l2.7 2.7L10 3.5" />
            </svg>
          </NuxtLink>
        </li>
        <li class="switcher-footer" role="none">
          <NuxtLink
            to="/"
            class="switcher-item"
            role="menuitem"
            @click="close()"
          >
            All properties &rarr;
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import { useDropdown } from "~/composables/useDropdown";
import { buildSwitcherItems } from "~/utils/propertySwitcher";

const props = defineProps<{ currentSlug: string; currentName: string }>();

const menuId = useId();
const route = useRoute();
const {
  rootRef,
  triggerRef,
  menuRef,
  isOpen,
  close,
  toggle,
  onTriggerKeydown,
  onMenuKeydown,
} = useDropdown();

const items = computed(() =>
  buildSwitcherItems(props.currentSlug, {
    query: route.query,
    hash: route.hash,
  }),
);
</script>

<style scoped>
.switcher {
  position: relative;
  display: flex;
}
.switcher-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.switcher-trigger:hover,
.switcher-trigger[aria-expanded="true"] {
  background: var(--surface-2);
}
.switcher-icon {
  color: var(--ink-2);
}
.switcher-panel {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  margin-top: 6px;
  min-width: 220px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
}
.switcher-menu {
  margin: 0;
  padding: 4px;
  list-style: none;
  display: flex;
  flex-direction: column;
}
.switcher-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ink-2);
}
.switcher-item:hover,
.switcher-item:focus-visible {
  background: var(--surface-2);
  color: var(--ink);
}
.switcher-item[aria-current="page"] {
  color: var(--ink);
  font-weight: 600;
}
.switcher-swatch {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 2px;
}
.switcher-item-name {
  flex-grow: 1;
}
.switcher-check {
  flex-shrink: 0;
}
.switcher-footer {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}
</style>
