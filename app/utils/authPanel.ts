// Builds the USERS & AUTH panel's view model (issue #111) from the real
// GET /api/apps/[slug] response. Every field is optional by design: a
// metric the Clerk sync didn't (or couldn't) derive is `null` and the panel
// omits that row/card, never fills it with a placeholder number.
//
// METRIC_*/PERIOD_* mirror server/utils/dashboardMetrics.ts (see
// metricTile.ts for why they're duplicated rather than imported).
import type {
  AppDetailResponse,
  CurrentMetric,
  IntegrationEnvironment,
  MetricPoint,
} from "#shared/types/dashboard";
import {
  findMetric,
  findSeries,
  METRIC_ACTIVE_SUBSCRIBERS,
  METRIC_NEW_USERS,
  METRIC_USERS,
  PERIOD_30D,
  PERIOD_CURRENT,
  PERIOD_DAILY,
} from "./metricTile";
import { formatCount, formatAxisDate } from "./rollupFormat";

export const METRIC_VERIFIED_USERS = "verified_users";
export const METRIC_ACTIVE_USERS = "active_users";
export const METRIC_SIGNUPS = "signups";
export const METRIC_AUTH_METHOD_PREFIX = "auth_method:";
export const PERIOD_7D = "7d";

const CLERK_VENDOR = "clerk";
const SIGNUPS_WINDOW_POINTS = 30;
const MIN_SIGNUP_POINTS = 2;
const PERCENT = 100;

const METHOD_LABELS: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  apple: "Apple",
  password: "Password",
  passwordless: "Passwordless",
  sso: "Enterprise SSO",
  web3: "Web3 wallet",
};
const CUSTOM_PROVIDER_PREFIX = "custom_";

export interface AuthMethodShare {
  label: string;
  pct: number;
  pctLabel: string;
}

export interface AuthSignups {
  points: MetricPoint[];
  bestDayLabel: string | null;
  bestDayCount: number;
}

export interface AuthPanelData {
  totalUsers: number;
  newUsersLabel: string | null;
  verifiedEmail: string | null;
  activeLast7d: string | null;
  convertedToPaid: string | null;
  signups: AuthSignups | null;
  methods: AuthMethodShare[];
  environment: IntegrationEnvironment | null;
  clerkUsersUrl: string | null;
}

function formatMethodLabel(method: string): string {
  const known = METHOD_LABELS[method];
  if (known) {
    return known;
  }
  const readable = method
    .replace(CUSTOM_PROVIDER_PREFIX, "")
    .replaceAll("_", " ");
  return `${readable.charAt(0).toUpperCase()}${readable.slice(1)}`;
}

// A scan-derived metric from an older sync (e.g. before the instance
// outgrew the scan cap) must not sit next to a fresher `users` total, so
// only rows stamped by the same sync as `users` count.
function fromSameSync(
  metric: CurrentMetric | undefined,
  users: CurrentMetric,
): CurrentMetric | null {
  return metric && metric.capturedAt === users.capturedAt ? metric : null;
}

function countLabel(metric: CurrentMetric | null): string | null {
  return metric ? formatCount(metric.value) : null;
}

function buildMethodShares(
  metrics: CurrentMetric[],
  users: CurrentMetric,
): AuthMethodShare[] {
  const methodMetrics = metrics.filter(
    (metric) =>
      metric.metric.startsWith(METRIC_AUTH_METHOD_PREFIX) &&
      metric.period === PERIOD_CURRENT &&
      fromSameSync(metric, users),
  );
  const total = methodMetrics.reduce((sum, metric) => sum + metric.value, 0);
  if (total === 0) {
    return [];
  }
  return methodMetrics
    .map((metric) => ({
      label: formatMethodLabel(
        metric.metric.slice(METRIC_AUTH_METHOD_PREFIX.length),
      ),
      pct: (metric.value / total) * PERCENT,
    }))
    .sort((first, second) => second.pct - first.pct)
    .map((share) => ({
      ...share,
      pctLabel: `${Math.round(share.pct)}%`,
    }));
}

const UTC_DATE_LENGTH = "YYYY-MM-DD".length;

function utcDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, UTC_DATE_LENGTH);
}

// Same staleness rule as fromSameSync: a series whose last day isn't the
// day of the current `users` sync came from an older scan.
function buildSignups(
  detail: AppDetailResponse,
  users: CurrentMetric,
): AuthSignups | null {
  const series = findSeries(detail.series, METRIC_SIGNUPS, PERIOD_DAILY);
  const points = series?.points.slice(-SIGNUPS_WINDOW_POINTS) ?? [];
  const lastPoint = points.at(-1);
  if (
    points.length < MIN_SIGNUP_POINTS ||
    !lastPoint ||
    utcDate(lastPoint.capturedAt) !== utcDate(users.capturedAt)
  ) {
    return null;
  }
  const best = points.reduce((leader, point) =>
    point.value > leader.value ? point : leader,
  );
  return {
    points,
    bestDayLabel: best.value > 0 ? formatAxisDate(best.capturedAt) : null,
    bestDayCount: best.value,
  };
}

// Active subscribers over total users. Omitted when either side is missing
// or the ratio is nonsensical (>100%: subscribers who aren't in this Clerk
// instance, so the share can't be derived).
function buildConvertedToPaid(
  metrics: CurrentMetric[],
  users: CurrentMetric,
): string | null {
  const subscribers = findMetric(
    metrics,
    METRIC_ACTIVE_SUBSCRIBERS,
    PERIOD_CURRENT,
  );
  if (!subscribers || users.value === 0) {
    return null;
  }
  const pct = (subscribers.value / users.value) * PERCENT;
  return pct > PERCENT ? null : `${pct.toFixed(1)}%`;
}

function clerkEnvironment(
  detail: AppDetailResponse,
): IntegrationEnvironment | null {
  return (
    detail.sources.find((source) => source.vendor === CLERK_VENDOR)
      ?.environment ?? null
  );
}

export function buildAuthPanelData(
  detail: AppDetailResponse | null,
): AuthPanelData | null {
  const users = detail
    ? findMetric(detail.metrics, METRIC_USERS, PERIOD_CURRENT)
    : undefined;
  if (!detail || !users) {
    return null;
  }
  const { metrics } = detail;
  const newUsers = findMetric(metrics, METRIC_NEW_USERS, PERIOD_30D);
  return {
    totalUsers: users.value,
    newUsersLabel: newUsers ? `+${formatCount(newUsers.value)} in 30d` : null,
    verifiedEmail: countLabel(
      fromSameSync(
        findMetric(metrics, METRIC_VERIFIED_USERS, PERIOD_CURRENT),
        users,
      ),
    ),
    activeLast7d: countLabel(
      fromSameSync(findMetric(metrics, METRIC_ACTIVE_USERS, PERIOD_7D), users),
    ),
    convertedToPaid: buildConvertedToPaid(metrics, users),
    signups: buildSignups(detail, users),
    methods: buildMethodShares(metrics, users),
    environment: clerkEnvironment(detail),
    clerkUsersUrl: detail.clerkUsersUrl,
  };
}
