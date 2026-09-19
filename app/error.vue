<template>
  <div class="err-wrap">
    <main class="err">
      <div class="err__inner">
        <div class="eyebrow" style="justify-content: center">
          error {{ statusCode }}
        </div>
        <div class="err__code">{{ statusCode }}</div>
        <h1>{{ heading }}</h1>
        <p>
          The page you're looking for doesn't exist or has moved. Let's get you
          back on track.
        </p>
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

const props = defineProps<{ error: NuxtError | null }>();

const statusCode = computed(() => props.error?.statusCode ?? 404);
const heading = computed(() =>
  statusCode.value === 404 ? "This page isn't here." : "Something went wrong.",
);

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
