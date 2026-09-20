<template>
  <div class="err-wrap">
    <main class="err">
      <div class="err__inner">
        <div class="eyebrow" style="justify-content: center">
          error {{ statusCode }}
        </div>
        <div class="err__code">{{ statusCode }}</div>
        <h1>{{ content.heading }}</h1>
        <p>{{ content.message }}</p>
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
import { SIGNUPS_DISABLED_ERROR_CODE } from "#shared/constants/errors";

interface ErrorContent {
  heading: string;
  message: string;
}

// Keep in sync with the statuses/codes the server actually throws (see
// server/utils/auth.ts and server/api/apps/[slug].get.ts) so this page can
// give each one a real message instead of the generic fallback.
const NOT_FOUND_STATUS_CODE = 404;
const SIGNUPS_DISABLED_STATUS_CODE = 403;
// Falls back to a server-error status (rather than 404) for a missing or
// statusless error, since presenting an unknown failure as "page not found"
// would hide a real bug behind the wrong message.
const UNKNOWN_ERROR_STATUS_CODE = 500;

const NOT_FOUND_CONTENT: ErrorContent = {
  heading: "This page isn't here.",
  message:
    "The page you're looking for doesn't exist or has moved. Let's get you back on track.",
};

const SIGNUPS_DISABLED_CONTENT: ErrorContent = {
  heading: "Sign-ups are closed.",
  message:
    "This dashboard isn't accepting new accounts right now. If you think you should have access, reach out to whoever invited you.",
};

// Deliberately never surfaces error.statusMessage: the only other status this
// app throws today (401 Unauthorized from requireUser()) isn't user-facing
// copy, and any future/unrecognized error falls here too rather than
// echoing an internal string.
const GENERIC_CONTENT: ErrorContent = {
  heading: "Something went wrong.",
  message: "An unexpected error occurred. Let's get you back on track.",
};

const props = defineProps<{ error: NuxtError | null }>();

const statusCode = computed(
  () => props.error?.statusCode ?? UNKNOWN_ERROR_STATUS_CODE,
);

// statusCode alone isn't a reliable discriminator — a future 403 from
// somewhere else in the app shouldn't be told "sign-ups are closed" — so this
// also checks the stable error code the server attaches for this specific
// case (see shared/constants/errors.ts). Nuxt parses error.data back into an
// object by default (experimental.parseErrorData), so `data` is only ever a
// string here if that's explicitly turned off; the optional chaining below
// degrades to the generic message rather than throwing if so.
const isSignupsDisabled = computed(() => {
  if (statusCode.value !== SIGNUPS_DISABLED_STATUS_CODE) {
    return false;
  }
  const data = props.error?.data as { code?: string } | undefined;
  return data?.code === SIGNUPS_DISABLED_ERROR_CODE;
});

const content = computed<ErrorContent>(() => {
  if (statusCode.value === NOT_FOUND_STATUS_CODE) {
    return NOT_FOUND_CONTENT;
  }
  if (isSignupsDisabled.value) {
    return SIGNUPS_DISABLED_CONTENT;
  }
  return GENERIC_CONTENT;
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
