import type { MetricPoint, SentryPanelIssue } from "#shared/types/dashboard";
import { formatCount } from "./rollupFormat";
import { buildSparklinePath } from "./sparklinePath";

export const SENTRY_TREND_VIEWBOX_WIDTH = 300;
export const SENTRY_TREND_VIEWBOX_HEIGHT = 60;

const LEVEL_COLOR_ERROR = "var(--err)";
const LEVEL_COLOR_WARNING = "var(--warn)";
const LEVEL_COLOR_QUIET = "var(--ink-2)";
const LEVEL_COLORS: Record<string, string> = {
  fatal: LEVEL_COLOR_ERROR,
  error: LEVEL_COLOR_WARNING,
  warning: LEVEL_COLOR_QUIET,
};

export interface SentryIssueRowView {
  id: string;
  title: string;
  levelLabel: string;
  levelColor: string;
  location: string;
  eventsLabel: string;
  usersLabel: string;
  lastSeen: string;
  permalink: string;
}

function countLabel(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? "" : "s"}`;
}

function toIssueRowView(issue: SentryPanelIssue): SentryIssueRowView {
  return {
    id: issue.id,
    title: issue.title,
    levelLabel: issue.level.toUpperCase(),
    levelColor: LEVEL_COLORS[issue.level] ?? LEVEL_COLOR_QUIET,
    location: issue.culprit,
    eventsLabel: countLabel(issue.eventCount, "event"),
    usersLabel: countLabel(issue.userCount, "user"),
    lastSeen: issue.lastSeen,
    permalink: issue.permalink,
  };
}

export function buildSentryIssueRows(
  issues: SentryPanelIssue[],
): SentryIssueRowView[] {
  return issues.map(toIssueRowView);
}

export function buildSentryTrendPath(trend: MetricPoint[]): string {
  return buildSparklinePath(
    trend,
    SENTRY_TREND_VIEWBOX_WIDTH,
    SENTRY_TREND_VIEWBOX_HEIGHT,
  );
}
