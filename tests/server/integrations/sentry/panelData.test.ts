import { describe, expect, it, vi } from "vitest";
import { fetchSentryPanelData } from "../../../../server/integrations/sentry/panelData";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import type { SentryIssueSummary } from "../../../../server/integrations/sentry/types";

function issue(
  id: string,
  overrides: Partial<SentryIssueSummary> = {},
): SentryIssueSummary {
  return {
    id,
    title: `Issue ${id}`,
    level: "error",
    culprit: "app.ts",
    eventCount: 10,
    userCount: 2,
    lastSeen: "2026-09-19T00:00:00.000Z",
    permalink: `https://sentry.io/organizations/acme/issues/${id}/`,
    projectId: "7",
    eventStats: [{ timestamp: 100, count: 1 }],
    ...overrides,
  };
}

const config = createTestIntegrationConfig({
  vendor: "sentry",
  externalId: "markpost",
  secret: "token",
});

describe("fetchSentryPanelData", () => {
  it("returns null without calling Sentry when no project slug is configured", async () => {
    const fetchTopIssues = vi.fn();

    const result = await fetchSentryPanelData(
      createTestIntegrationConfig({ vendor: "sentry", externalId: null }),
      "acme",
      fetchTopIssues,
    );

    expect(result).toBeNull();
    expect(fetchTopIssues).not.toHaveBeenCalled();
  });

  it("queries the unresolved issues of the configured project", async () => {
    const fetchTopIssues = vi.fn(async () => ({ issues: [] }));

    await fetchSentryPanelData(config, "acme", fetchTopIssues);

    expect(fetchTopIssues).toHaveBeenCalledWith({
      projectSlug: "markpost",
      query: "is:unresolved",
    });
  });

  it("shows the top five issues but sums the trend over all fetched ones", async () => {
    const issues = Array.from({ length: 7 }, (_, index) =>
      issue(String(index)),
    );

    const result = await fetchSentryPanelData(config, "acme", async () => ({
      issues,
    }));

    expect(result?.issues.map((row) => row.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(result?.trendTotalEvents).toBe(7);
    expect(result?.trend).toHaveLength(1);
  });

  it("does not leak internal fields into the response rows", async () => {
    const result = await fetchSentryPanelData(config, "acme", async () => ({
      issues: [issue("1")],
    }));

    expect(Object.keys(result!.issues[0]!)).not.toContain("eventStats");
    expect(Object.keys(result!.issues[0]!)).not.toContain("projectId");
  });

  it("returns an empty list, with a project-page link, when there are no issues", async () => {
    const result = await fetchSentryPanelData(config, "acme", async () => ({
      issues: [],
    }));

    expect(result).toEqual({
      issues: [],
      trend: [],
      trendTotalEvents: 0,
      issuesUrl: "https://sentry.io/organizations/acme/projects/markpost/",
    });
  });

  it("links to the project's issue list once an issue reveals the project id", async () => {
    const result = await fetchSentryPanelData(config, "acme", async () => ({
      issues: [issue("1", { projectId: null }), issue("2")],
    }));

    expect(result?.issuesUrl).toBe(
      "https://sentry.io/organizations/acme/issues/?project=7&query=is%3Aunresolved",
    );
  });

  it("propagates a Sentry failure", async () => {
    await expect(
      fetchSentryPanelData(config, "acme", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
