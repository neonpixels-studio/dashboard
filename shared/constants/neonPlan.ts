// Neon free-plan allowances and the alert rules measured against them. Kept
// in one place so a plan change (or a move off the free plan) is a one-file
// edit. Source: https://neon.com/docs/introduction/plans (Free plan, checked
// October 10th, 2026): 100 CU-hours of compute per project per month, 1 GB of
// storage per project, 5 GB of public network transfer per project per month.
// Neon counts storage in binary units, hence GiB.
export const SECONDS_PER_HOUR = 3_600;
export const BYTES_PER_GIB = 1_024 ** 3;

export const NEON_FREE_PLAN_COMPUTE_CU_HOURS = 100;
export const NEON_FREE_PLAN_STORAGE_BYTES = BYTES_PER_GIB;
const NEON_FREE_PLAN_DATA_TRANSFER_BYTES = 5 * BYTES_PER_GIB;

// A projected (compute) or current (storage) share of the allowance at or
// above this raises an alert.
export const NEON_ALERT_THRESHOLD_RATIO = 0.8;

// Anything else (typically a leftover `agent-*` E2E branch) raises an alert.
export const NEON_EXPECTED_BRANCH_NAMES: readonly string[] = [
  "production",
  "development",
  "e2e",
];

// Early in a billing period a few hours of usage extrapolated over a month is
// noise (a sync that just woke the compute would "project" a blown limit), so
// no projection is made until this much of the period has elapsed.
export const NEON_MIN_PROJECTION_ELAPSED_MS = 6 * SECONDS_PER_HOUR * 1_000;

export const NEON_VENDOR = "neon";
