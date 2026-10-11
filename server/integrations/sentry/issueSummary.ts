import type { MetricPoint } from "../../../shared/types/dashboard";
import type { SentryIssueSummary, SentryStatPoint } from "./types";

// The `stats` key Sentry nests the daily buckets under, which is also the
// `statsPeriod` the client asks for. Sentry only supports "24h" and "14d".
export const SENTRY_STATS_PERIOD = "14d";

const SENTRY_WEB_BASE_URL = "https://sentry.io";
const MS_PER_SECOND = 1_000;
const HTTPS_PROTOCOL = "https:";
const DECIMAL_RADIX = 10;

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null;
}

function requireString(raw: RawRecord, field: string): string {
  const value = raw[field];
  if (typeof value !== "string") {
    throw new Error(`Sentry issue is missing a string "${field}" field.`);
  }
  return value;
}

// Sentry sends `count` as a numeric string and `userCount` as a number.
function requireCount(raw: RawRecord, field: string): number {
  const value = raw[field];
  const parsed =
    typeof value === "string" ? Number.parseInt(value, DECIMAL_RADIX) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new Error(`Sentry issue has a non-numeric "${field}" field.`);
  }
  return parsed;
}

// The permalink becomes an href, so anything but https is refused rather than
// rendered (a `javascript:` URL from a compromised response would be XSS).
function requireHttpsUrl(raw: RawRecord, field: string): string {
  const value = requireString(raw, field);
  if (!URL.canParse(value) || new URL(value).protocol !== HTTPS_PROTOCOL) {
    throw new Error(`Sentry issue "${field}" is not an https URL.`);
  }
  return value;
}

function toStatPoint(raw: unknown): SentryStatPoint | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const [timestamp, count] = raw;
  if (typeof timestamp !== "number" || typeof count !== "number") {
    return null;
  }
  return { timestamp, count };
}

// Stats are optional garnish: a missing or odd-shaped series yields an empty
// trend instead of failing the whole issue list.
function readEventStats(raw: RawRecord): SentryStatPoint[] {
  const stats = raw["stats"];
  if (!isRecord(stats)) {
    return [];
  }
  const series = stats[SENTRY_STATS_PERIOD];
  if (!Array.isArray(series)) {
    return [];
  }
  return series
    .map(toStatPoint)
    .filter((point): point is SentryStatPoint => point !== null);
}

function readProjectId(raw: RawRecord): string | null {
  const project = raw["project"];
  if (!isRecord(project) || typeof project["id"] !== "string") {
    return null;
  }
  return project["id"];
}

/**
 * Translates one raw Sentry issue into the panel's SentryIssueSummary. Fails
 * loud on a missing or malformed identity/display field, same as
 * mapping.ts's toSentryIssue.
 */
export function toSentryIssueSummary(raw: unknown): SentryIssueSummary {
  if (!isRecord(raw)) {
    throw new Error("Sentry issue is not an object.");
  }
  return {
    id: requireString(raw, "id"),
    title: requireString(raw, "title"),
    level: requireString(raw, "level"),
    culprit: typeof raw["culprit"] === "string" ? raw["culprit"] : "",
    eventCount: requireCount(raw, "count"),
    userCount: requireCount(raw, "userCount"),
    lastSeen: requireString(raw, "lastSeen"),
    permalink: requireHttpsUrl(raw, "permalink"),
    projectId: readProjectId(raw),
    eventStats: readEventStats(raw),
  };
}

/**
 * Sums every issue's daily buckets into one event-count series, oldest first.
 * It covers the issues that were fetched, not the whole project, so the panel
 * labels it accordingly.
 */
export function aggregateEventTrend(
  issues: SentryIssueSummary[],
): MetricPoint[] {
  const countsByTimestamp = new Map<number, number>();
  for (const point of issues.flatMap((issue) => issue.eventStats)) {
    countsByTimestamp.set(
      point.timestamp,
      (countsByTimestamp.get(point.timestamp) ?? 0) + point.count,
    );
  }
  return [...countsByTimestamp.entries()]
    .sort(([first], [second]) => first - second)
    .map(([timestamp, count]) => ({
      capturedAt: new Date(timestamp * MS_PER_SECOND).toISOString(),
      value: count,
    }));
}

/**
 * Where "view all issues" points. The issues list needs Sentry's numeric
 * project id, which only arrives on an issue, so with no issues (or no
 * project object) it falls back to the project's own page in Sentry.
 */
export function buildSentryIssuesUrl(
  orgSlug: string,
  projectSlug: string,
  projectId: string | null,
): string {
  const org = encodeURIComponent(orgSlug);
  if (!projectId) {
    return `${SENTRY_WEB_BASE_URL}/organizations/${org}/projects/${encodeURIComponent(projectSlug)}/`;
  }
  const url = new URL(`${SENTRY_WEB_BASE_URL}/organizations/${org}/issues/`);
  url.searchParams.set("project", projectId);
  url.searchParams.set("query", "is:unresolved");
  return url.toString();
}
