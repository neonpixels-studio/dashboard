<template>
  <div class="page-shell">
    <ControlTopBar :crumb="app.name" />
    <AppHeaderBand :app="app" :secondary-links="secondaryLinks" />
    <component :is="templateComponent" :app="app" />
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
</script>
