// Canonical `metric_snapshot.metric` values, per the naming convention
// documented on the schema itself (server/db/schema.ts: "e.g. mrr,
// active_subscribers, sessions, open_issues, users, posts"). Centralized so
// every handler/shaping function references the same string instead of
// re-typing it inline.
export const METRIC_MRR = "mrr";
export const METRIC_ACTIVE_SUBSCRIBERS = "active_subscribers";
export const METRIC_SESSIONS = "sessions";
export const METRIC_OPEN_ISSUES = "open_issues";

// Canonical `metric_snapshot.period` values (schema: "e.g. \"30d\", \"current\"").
// A metric name alone doesn't identify a series — the schema allows the same
// metric at multiple periods — so any lookup for one specific series needs
// both.
export const PERIOD_CURRENT = "current";
export const PERIOD_30D = "30d";
