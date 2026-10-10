import {
  METRIC_ACTIVE_USERS,
  METRIC_AUTH_METHOD_PREFIX,
  METRIC_NEW_USERS,
  METRIC_SIGNUPS,
  METRIC_USERS,
  METRIC_VERIFIED_USERS,
  PERIOD_30D,
  PERIOD_7D,
  PERIOD_CURRENT,
  PERIOD_DAILY,
} from "../../utils/dashboardMetrics";
import type {
  IntegrationConfig,
  IntegrationProvider,
  MetricSnapshotInput,
  ProviderResult,
} from "../types";
import {
  createClerkUserCountGetter,
  createClerkUserScanner,
} from "./clerkClient";
import {
  assertNonNegativeCount,
  computeNewUsersWindowStart,
  countActiveSince,
  countBySignInMethod,
  countDailySignups,
  countVerifiedEmailUsers,
  isCompleteScan,
} from "./mapping";
import type { ClerkUserScan, GetClerkUserCount, ScanClerkUsers } from "./types";

const CLERK_VENDOR = "clerk";
// How far back the new-users delta looks: a rolling 30×24h window ending at
// capturedAt. NOT calendar-aligned the same way GA4's 30d sessions total is
// (server/integrations/ga4/provider.ts's REPORT_START_DATE/REPORT_END_DATE
// use GA4's own "30daysAgo".."yesterday" relative-date syntax, scoped to the
// property's reporting timezone and complete calendar days only) — the two
// "last 30 days" figures are close but not guaranteed to cover the exact
// same instants.
const NEW_USERS_WINDOW_DAYS = 30;
const ACTIVE_USERS_WINDOW_DAYS = 7;
const SIGNUPS_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A fresh object per call — a single shared module-level constant here
// would let a caller that mutates its `metrics`/`trafficBreakdown`/
// `syndicationPosts` arrays (e.g. `result.metrics.push(...)`) leak that
// mutation into every later unconfigured-app sync's "no rows" result.
function buildEmptyProviderResult(): ProviderResult {
  return { metrics: [], trafficBreakdown: [], syndicationPosts: [] };
}

function clerkMetric(
  metric: string,
  value: number,
  period: string,
  capturedAt: Date,
): MetricSnapshotInput {
  return { vendor: CLERK_VENDOR, metric, value, period, capturedAt };
}

// Everything derived from walking the user list. Empty (not zeros) for an
// incomplete scan: see mapping.ts's isCompleteScan.
function buildScanMetrics(
  scan: ClerkUserScan,
  capturedAt: Date,
): MetricSnapshotInput[] {
  if (!isCompleteScan(scan)) {
    return [];
  }
  const activeSince =
    capturedAt.getTime() - ACTIVE_USERS_WINDOW_DAYS * MS_PER_DAY;
  const methodMetrics = [...countBySignInMethod(scan.users)].map(
    ([method, count]) =>
      clerkMetric(
        `${METRIC_AUTH_METHOD_PREFIX}${method}`,
        count,
        PERIOD_CURRENT,
        capturedAt,
      ),
  );
  const signupMetrics = countDailySignups(
    scan.users,
    capturedAt,
    SIGNUPS_WINDOW_DAYS,
  ).map(({ dayStart, count }) =>
    clerkMetric(METRIC_SIGNUPS, count, PERIOD_DAILY, dayStart),
  );
  return [
    clerkMetric(
      METRIC_VERIFIED_USERS,
      countVerifiedEmailUsers(scan.users),
      PERIOD_CURRENT,
      capturedAt,
    ),
    clerkMetric(
      METRIC_ACTIVE_USERS,
      countActiveSince(scan.users, activeSince),
      PERIOD_7D,
      capturedAt,
    ),
    ...methodMetrics,
    ...signupMetrics,
  ];
}

/**
 * Core fetch logic, decoupled from the real Clerk client so it can be unit
 * tested against a fixture-backed `GetClerkUserCount` with no network call
 * — `clerkProvider.fetch` below is the only caller that wires in the real
 * one (clerkClient.ts).
 *
 * Per the issue's account model, each product app is its own Clerk
 * instance, so — unlike Stripe's product ids or GA4's property id — there's
 * no separate "which instance" identifier to resolve here: an app's Clerk
 * *secret key itself* is the per-instance identity. `config.secret` is
 * therefore the only "configured at all" signal this provider has, and per
 * the issue's acceptance criteria a missing one returns no rows rather than
 * throwing — unlike Stripe/GA4, whose secret is one shared studio-wide
 * credential, so a secret-less *enabled* row there is closer to a
 * misconfiguration than an intentionally-unconfigured app. This is this
 * function's own defense-in-depth copy of that guarantee; `clerkProvider.fetch`
 * carries the same check so it never even builds a client from a missing
 * secret.
 */
export async function fetchClerkMetrics(
  config: IntegrationConfig,
  getClerkUserCount: GetClerkUserCount,
  scanClerkUsers: ScanClerkUsers,
): Promise<ProviderResult> {
  if (!config.secret) {
    return buildEmptyProviderResult();
  }

  const capturedAt = new Date();
  const newUsersWindowStart = computeNewUsersWindowStart(
    capturedAt,
    NEW_USERS_WINDOW_DAYS,
  );

  const [totalUsersResponse, newUsersResponse, scan] = await Promise.all([
    getClerkUserCount({}),
    getClerkUserCount({ createdAtAfter: newUsersWindowStart }),
    scanClerkUsers(),
  ]);
  const totalUsers = assertNonNegativeCount(
    totalUsersResponse.totalCount,
    "total users",
  );
  const newUsers = assertNonNegativeCount(
    newUsersResponse.totalCount,
    "new users",
  );

  return {
    metrics: [
      clerkMetric(METRIC_USERS, totalUsers, PERIOD_CURRENT, capturedAt),
      clerkMetric(METRIC_NEW_USERS, newUsers, PERIOD_30D, capturedAt),
      ...buildScanMetrics(scan, capturedAt),
    ],
    trafficBreakdown: [],
    syndicationPosts: [],
  };
}

export const clerkProvider: IntegrationProvider = {
  vendor: CLERK_VENDOR,
  async fetch(config: IntegrationConfig): Promise<ProviderResult> {
    if (!config.secret) {
      return buildEmptyProviderResult();
    }
    const getClerkUserCount = createClerkUserCountGetter(config.secret);
    const scanClerkUsers = createClerkUserScanner(config.secret);
    return fetchClerkMetrics(config, getClerkUserCount, scanClerkUsers);
  },
};
