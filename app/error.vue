<template>
  <div class="err-wrap">
    <main class="err">
      <div class="err__inner">
        <div class="eyebrow" style="justify-content: center">
          error {{ statusCode }}
        </div>
        <div class="err__code">{{ statusCode }}</div>
        <h1>{{ heading }}</h1>
        <p>{{ message }}</p>
        <div class="err__cta">
          <button class="btn btn-accent btn-lg" @click="handleError">
            back to home
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from "#app";

// Keep in sync with the statuses the server actually throws (see
// server/utils/auth.ts) so this page can give each one a real message
// instead of the generic fallback.
const NOT_FOUND_STATUS_CODE = 404;
const SIGNUPS_DISABLED_STATUS_CODE = 403;

const NOT_FOUND_HEADING = "This page isn't here.";
const NOT_FOUND_MESSAGE =
  "The page you're looking for doesn't exist or has moved. Let's get you back on track.";

const SIGNUPS_DISABLED_HEADING = "Sign-ups are closed.";
const SIGNUPS_DISABLED_MESSAGE =
  "This dashboard isn't accepting new accounts right now. If you think you should have access, reach out to whoever invited you.";

const GENERIC_HEADING = "Something went wrong.";
const GENERIC_MESSAGE =
  "An unexpected error occurred. Let's get you back on track.";

const props = defineProps<{ error: NuxtError | null }>();

const statusCode = computed(
  () => props.error?.statusCode ?? NOT_FOUND_STATUS_CODE,
);

const heading = computed(() => {
  if (statusCode.value === NOT_FOUND_STATUS_CODE) {
    return NOT_FOUND_HEADING;
  }
  if (statusCode.value === SIGNUPS_DISABLED_STATUS_CODE) {
    return SIGNUPS_DISABLED_HEADING;
  }
  return GENERIC_HEADING;
});

// error.statusMessage is safe to surface here: every non-404/403 status this
// app throws comes from our own createError() calls (e.g. 401 Unauthorized),
// never a raw exception message, so there's no internals to leak.
const message = computed(() => {
  if (statusCode.value === NOT_FOUND_STATUS_CODE) {
    return NOT_FOUND_MESSAGE;
  }
  if (statusCode.value === SIGNUPS_DISABLED_STATUS_CODE) {
    return SIGNUPS_DISABLED_MESSAGE;
  }
  return props.error?.statusMessage || GENERIC_MESSAGE;
});

function handleError() {
  clearError({ redirect: "/" });
}
</script>

<style scoped>
.err-wrap {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.err {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 20px;
}
.err__inner {
  text-align: center;
  max-width: 480px;
}
.err__code {
  font-family: var(--mono);
  font-weight: 700;
  font-size: clamp(88px, 18vw, 180px);
  line-height: 0.9;
  letter-spacing: -0.04em;
  color: var(--accent);
  margin-top: 6px;
}
.err h1 {
  font-size: clamp(24px, 4vw, 34px);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 14px 0 10px;
}
.err p {
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.6;
  margin: 0 auto 26px;
  max-width: 420px;
}
.err__cta {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
