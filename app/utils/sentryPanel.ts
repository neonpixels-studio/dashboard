import type { MetricPoint, SentryPanelIssue } from "#shared/types/dashboard";
import { formatCount } from "./rollupFormat";
import { buildSparklinePath } from "./sparklinePath";

export const SENTRY_TREND_VIEWBOX_WIDTH = 300;
export const SENTRY_TREND_VIEWBOX_HEIGHT = 60;

// Each Sentry level renders one step quieter than its name suggests, matching
// the design: error is amber, warning (and anything else) is muted.
const COLOR_RED = "var(--err)";
const COLOR_AMBER = "var(--warn)";
const COLOR_MUTED = "var(--ink-2)";
const LEVEL_COLORS: Record<string, string> = {
  fatal: COLOR_RED,
  error: COLOR_AMBER,
  warning: COLOR_MUTED,
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
    levelColor: LEVEL_COLORS[issue.level] ?? COLOR_MUTED,
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
