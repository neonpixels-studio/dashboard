// Canonical `metric_snapshot.metric` values, per the naming convention
// documented on the schema itself (server/db/schema.ts: "e.g. mrr,
// active_subscribers, sessions, open_issues, users, posts"). Centralized so
// every handler/shaping function references the same string instead of
// re-typing it inline.
export const METRIC_MRR = "mrr";
export const METRIC_ACTIVE_SUBSCRIBERS = "active_subscribers";
export const METRIC_SESSIONS = "sessions";
export const METRIC_OPEN_ISSUES = "open_issues";
