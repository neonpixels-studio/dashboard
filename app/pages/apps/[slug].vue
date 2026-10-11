<template>
  <div class="page-shell">
    <ControlTopBar :crumb="app.name" :crumb-slug="app.slug" />
    <AppHeaderBand
      :app="app"
      :status="headerStatus"
      :secondary-links="secondaryLinks"
    />
    <component
      :is="templateComponent"
      :app="appViewModel"
      :pending="pending"
      :error="error"
      :refresh="refresh"
    />
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import {
  AppDetailMarketing,
  AppDetailProduct,
  AppDetailWriting,
} from "#components";
import { findAppBySlug, type AppTemplate } from "~/config/apps";
import { useApp } from "~/composables/useApp";
import { toAppDetailViewModel } from "~/utils/appViewModel";
import { buildHeaderLinks } from "~/utils/headerLinks";
import { resolveHeaderStatus } from "~/utils/headerStatus";

const route = useRoute();
const app = findAppBySlug(String(route.params.slug));

if (!app) {
  throw createError({ statusCode: 404, statusMessage: "Property not found" });
}

useHead({ title: `${app.name} dashboard · Neon Pixels Control` });

const TEMPLATE_COMPONENTS: Record<AppTemplate, Component> = {
  product: AppDetailProduct,
  writing: AppDetailWriting,
  marketing: AppDetailMarketing,
};

const templateComponent = TEMPLATE_COMPONENTS[app.template];
const secondaryLinks = buildHeaderLinks(app);

const { data: detail, pending, error, refresh } = useApp(() => app.slug);
const headerStatus = computed(() =>
  resolveHeaderStatus(detail.value?.status, error.value),
);
const appViewModel = computed(() =>
  toAppDetailViewModel(app, detail.value ?? null),
);
</script>
