import { describe, expect, it } from "vitest";
import { buildGithubCiAlerts } from "../../../server/utils/githubAlerts";
import type { GithubRepoStatusRow } from "../../../server/utils/dashboardQueries";

function failingRow(
  overrides: Partial<GithubRepoStatusRow> = {},
): GithubRepoStatusRow {
  return {
    id: 1,
    slug: "markpost",
    repo: "markpost-cli",
    openIssues: 0,
    openPrs: 0,
    ciState: "failing",
    ciSha: "abc123",
    commitAt: new Date("2026-10-09T08:00:00Z"),
    syncedAt: new Date("2026-10-10T00:00:00Z"),
    ...overrides,
  };
}

describe("buildGithubCiAlerts", () => {
  it("alerts on the owning property while naming the failing repo", () => {
    expect(buildGithubCiAlerts([failingRow()])).toEqual([
      {
        id: "ci-failing:markpost:markpost-cli",
        slug: "markpost",
        source: "github",
        message: "CI failing on main (markpost-cli)",
        occurredAt: "2026-10-09T08:00:00.000Z",
        href: "https://github.com/neonpixels-studio/markpost-cli/commit/abc123/checks",
      },
    ]);
  });

  it("raises one alert per failing repo", () => {
    const alerts = buildGithubCiAlerts([
      failingRow({ repo: "markpost" }),
      failingRow({ repo: "markpost-cli" }),
    ]);
    expect(alerts.map((alert) => alert.id)).toEqual([
      "ci-failing:markpost:markpost",
      "ci-failing:markpost:markpost-cli",
    ]);
  });

  it("is empty when no repo is failing, so an alert clears once main is green", () => {
    expect(buildGithubCiAlerts([])).toEqual([]);
  });
});
