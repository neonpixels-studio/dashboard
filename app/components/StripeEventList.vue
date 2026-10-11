<template>
  <ul v-if="events.length" class="transactions">
    <li
      v-for="transaction in events"
      :key="transaction.key"
      class="transaction"
    >
      <span class="tx-date">{{ transaction.date }}</span>
      <a
        v-if="transaction.url"
        class="tx-email tx-link"
        :href="transaction.url"
        :aria-label="transaction.linkLabel"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ transaction.email }}
      </a>
      <span v-else class="tx-email">{{ transaction.email }}</span>
      <span class="tx-plan" :class="{ warn: transaction.failed }">
        {{ transaction.plan }}
      </span>
      <span class="tx-amount" :class="{ muted: transaction.muted }">
        {{ transaction.amount }}
      </span>
    </li>
  </ul>
  <p v-else class="section-empty">No recent subscription activity.</p>
</template>

<script setup lang="ts">
import type { StripeEventRowView } from "~/utils/stripePanel";

defineProps<{ events: StripeEventRowView[] }>();
</script>

<style scoped>
.transactions {
  margin: 0;
  padding: 4px 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line-3);
}
.transaction {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
}
.transaction:not(:last-child) {
  border-bottom: 1px solid var(--line-3);
}
.tx-date {
  width: 66px;
  font-size: 10px;
  color: var(--ink-3);
}
.tx-email {
  flex-grow: 1;
  font-size: 11px;
}
.tx-link {
  color: inherit;
  text-decoration: none;
}
.tx-link:hover,
.tx-link:focus-visible {
  text-decoration: underline;
}
.tx-plan {
  width: 190px;
  font-size: 11px;
  color: var(--ink-2);
}
.tx-plan.warn {
  color: var(--warn);
}
.tx-amount {
  width: 96px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  color: var(--ok);
}
.tx-amount.muted {
  color: var(--ink-3);
}
.section-empty {
  margin: 0;
  font-size: 11px;
  color: var(--ink-3);
}
</style>
