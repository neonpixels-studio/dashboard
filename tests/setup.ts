import {
  computed,
  ref,
  reactive,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  onScopeDispose,
  nextTick,
  defineComponent,
  defineProps,
  defineEmits,
  withDefaults,
  useAttrs,
  useSlots,
} from "vue";

Object.assign(globalThis, {
  computed,
  ref,
  reactive,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  onScopeDispose,
  nextTick,
  defineComponent,
  defineProps,
  defineEmits,
  withDefaults,
  useAttrs,
  useSlots,
});

// Nuxt / Nitro handler wrappers — identity, so the inner function is what the
// module under test exports.
Object.assign(globalThis, {
  defineNuxtRouteMiddleware: (handler: unknown) => handler,
  defineEventHandler: (handler: unknown) => handler,
  // H3's createError, as a real Error carrying the status fields so tests can
  // assert on `statusCode` via rejects.toMatchObject.
  createError: ({
    statusCode,
    statusMessage,
    data,
  }: {
    statusCode: number;
    statusMessage: string;
    data?: unknown;
  }) => Object.assign(new Error(statusMessage), { statusCode, data }),
});

// useTheme keeps a module-level `ref()` singleton, so it must be imported
// dynamically (after the Vue globals above are assigned) rather than via a
// static import, which vite hoists ahead of the Object.assign call.
const { useTheme } = await import("../app/composables/useTheme");
Object.assign(globalThis, { useTheme });
