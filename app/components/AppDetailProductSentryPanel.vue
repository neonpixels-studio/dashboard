<template>
  <SentryIssuesPanel
    :app="app"
    :panel="data ?? null"
    :pending="pending"
    :error="error"
    @retry="refresh()"
  />
</template>

<script setup lang="ts">
// Loads the live Sentry data for SentryIssuesPanel. Split from it so the
// presentation stays testable without a fetch layer.
import type { DashboardApp } from "~/config/apps";
import { useSentryPanel } from "~/composables/useSentryPanel";

const props = defineProps<{ app: DashboardApp }>();

const { data, pending, error, refresh } = useSentryPanel(() => props.app.slug);
</script>
