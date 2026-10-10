<template>
  <div class="auth-body">
    <p v-if="!auth" class="empty">Clerk user data hasn't synced yet.</p>
    <template v-else>
      <div class="auth-meta">
        <span v-if="auth.environment === 'development'" class="env-chip">
          development
        </span>
        <a
          v-if="auth.clerkUsersUrl"
          class="clerk-link"
          :href="auth.clerkUsersUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          View users in Clerk
        </a>
      </div>

      <div class="auth-grid">
        <div class="card">
          <PanelHead title="Total users" />
          <div class="big-value-row">
            <span class="display-num big-value">{{
              formatCount(auth.totalUsers)
            }}</span>
            <span v-if="auth.newUsersLabel" class="delta ok">{{
              auth.newUsersLabel
            }}</span>
          </div>
          <StatList
            v-if="statItems.length"
            class="auth-list"
            :divided="false"
            :items="statItems"
          />
        </div>
        <AuthSignupsCard
          v-if="auth.signups"
          :signups="auth.signups"
          :app-name="app.name"
          :color="app.accent"
        />
        <AuthMethodsCard
          v-if="auth.methods.length"
          :methods="auth.methods"
          :color="app.accent"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// The Clerk "USERS & AUTH" panel for AppDetailProduct (issues #20, #111) —
// split out purely to keep the parent template's size/complexity down.
// Everything renders from the real AppDetailResponse via buildAuthPanelData;
// a figure the Clerk sync couldn't derive is omitted rather than faked.
import type { AppDetailViewModel } from "~/utils/appViewModel";
import { buildAuthPanelData } from "~/utils/authPanel";
import { formatCount } from "~/utils/rollupFormat";

const props = defineProps<{ app: AppDetailViewModel }>();

const auth = computed(() => buildAuthPanelData(props.app.detail));

const statItems = computed(() => {
  const data = auth.value;
  if (!data) {
    return [];
  }
  return [
    { label: "Verified email", value: data.verifiedEmail },
    { label: "Active last 7d", value: data.activeLast7d },
    { label: "Converted to paid", value: data.convertedToPaid },
  ].filter(
    (item): item is { label: string; value: string } => item.value !== null,
  );
});
</script>

<style scoped>
.auth-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.auth-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.clerk-link {
  font-size: 11px;
  color: var(--ink-2);
  text-decoration: underline;
}
.empty {
  font-size: 11px;
  color: var(--ink-3);
}
.auth-grid {
  display: flex;
  gap: 16px;
}
/* Also styles the child cards' root elements (AuthSignupsCard,
   AuthMethodsCard): one shared card layout instead of three copies. */
.auth-grid > .card {
  flex: 1 1 0;
  min-width: 0;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.big-value-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.big-value {
  font-size: 40px;
}
.big-value-row .delta {
  padding-bottom: 5px;
}
.auth-list {
  margin-top: auto;
}
</style>
