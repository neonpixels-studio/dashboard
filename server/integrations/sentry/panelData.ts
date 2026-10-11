import type {
  SentryPanelIssue,
  SentryPanelResponse,
} from "../../../shared/types/dashboard";
import type { IntegrationConfig } from "../types";
import { aggregateEventTrend, buildSentryIssuesUrl } from "./issueSummary";
import { resolveProjectSlug, UNRESOLVED_ISSUES_QUERY } from "./provider";
import type { FetchSentryTopIssues, SentryIssueSummary } from "./types";

const PANEL_ISSUE_LIMIT = 5;

function toPanelIssue(issue: SentryIssueSummary): SentryPanelIssue {
  return {
    id: issue.id,
    title: issue.title,
    level: issue.level,
    culprit: issue.culprit,
    eventCount: issue.eventCount,
    userCount: issue.userCount,
    lastSeen: issue.lastSeen,
    permalink: issue.permalink,
  };
}

/**
 * Builds the Sentry panel's data from one top-issues request. Returns null
 * when the app has no Sentry project configured, which the endpoint turns
 * into a 404 rather than an empty (and misleading) "no issues" panel.
 */
export async function fetchSentryPanelData(
  config: IntegrationConfig,
  orgSlug: string,
  fetchTopIssues: FetchSentryTopIssues,
): Promise<SentryPanelResponse | null> {
  const projectSlug = resolveProjectSlug(config);
  if (!projectSlug) {
    return null;
  }

  const { issues } = await fetchTopIssues({
    projectSlug,
    query: UNRESOLVED_ISSUES_QUERY,
  });
  const trend = aggregateEventTrend(issues);
  const projectId = issues.find((issue) => issue.projectId)?.projectId ?? null;

  return {
    issues: issues.slice(0, PANEL_ISSUE_LIMIT).map(toPanelIssue),
    trend,
    trendTotalEvents: trend.reduce((total, point) => total + point.value, 0),
    issuesUrl: buildSentryIssuesUrl(orgSlug, projectSlug, projectId),
  };
}
