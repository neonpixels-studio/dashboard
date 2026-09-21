// Canonical `metric_snapshot.metric` values, per the naming convention
// documented on the schema itself (server/db/schema.ts: "e.g. mrr,
// active_subscribers, sessions, open_issues, users, posts"). Centralized so
// every handler/shaping function references the same string instead of
// re-typing it inline.
export const METRIC_MRR = "mrr";
export const METRIC_ACTIVE_SUBSCRIBERS = "active_subscribers";
export const METRIC_SESSIONS = "sessions";
export const METRIC_OPEN_ISSUES = "open_issues";
// Unresolved issues at Sentry's "fatal" level specifically — the subset of
// METRIC_OPEN_ISSUES that drives the status chip's danger tone (see
// server/integrations/sentry/mapping.ts's sentryStatusChip).
export const METRIC_FATAL_ISSUES = "fatal_issues";
export const METRIC_USERS = "users";
// The new-users delta for server/integrations/clerk/provider.ts's reporting
// window — not in the schema's own "e.g." list, but follows that list's
// snake_case convention (mirrors active_subscribers).
export const METRIC_NEW_USERS = "new_users";

// Canonical `metric_snapshot.period` values (schema: "e.g. \"30d\", \"current\"").
// A metric name alone doesn't identify a series — the schema allows the same
// metric at multiple periods — so any lookup for one specific series needs
// both.
export const PERIOD_CURRENT = "current";
export const PERIOD_30D = "30d";
// One row per calendar day (as opposed to PERIOD_30D's single rolling-window
// total) — server/integrations/ga4/provider.ts backfills the last 30 days of
// this on every sync so a sparkline has data immediately, rather than
// depending on 60 days of PERIOD_CURRENT-style daily polls to accumulate.
export const PERIOD_DAILY = "daily";
