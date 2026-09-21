<template>
  <div class="page-shell">
    <ControlTopBar :crumb="app.name" />
    <AppHeaderBand :app="app" :secondary-links="secondaryLinks" />
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

const TEMPLATE_SECONDARY_LINKS: Record<AppTemplate, string[]> = {
  product: ["Logs", "Settings"],
  writing: ["Posts"],
  marketing: [],
};

const templateComponent = TEMPLATE_COMPONENTS[app.template];
const secondaryLinks = TEMPLATE_SECONDARY_LINKS[app.template];

const { data: detail, pending, error, refresh } = useApp(() => app.slug);
const appViewModel = computed(() =>
  toAppDetailViewModel(app, detail.value ?? null),
);
</script>
