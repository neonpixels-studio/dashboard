import { describe, expect, it } from "vitest";
import { buildGithubDetail } from "../../../../server/integrations/github/detail";
import type {
  GithubItemRow,
  GithubRepoStatusRow,
} from "../../../../server/utils/dashboardQueries";

function itemRow(repo: string, number: number): GithubItemRow {
  return {
    id: number,
    slug: "markpost",
    repo,
    number,
    kind: "issue",
    title: `T${number}`,
    url: `https://github.com/neonpixels-studio/${repo}/issues/${number}`,
    labels: [],
    itemUpdatedAt: new Date("2026-10-09T00:00:00Z"),
  };
}

function statusRow(repo: string): GithubRepoStatusRow {
  return {
    id: 1,
    slug: "markpost",
    repo,
    openIssues: 1,
    openPrs: 0,
    ciState: "passing",
    ciSha: "abc",
    commitAt: new Date("2026-10-09T00:00:00Z"),
    syncedAt: new Date("2026-10-10T00:00:00Z"),
  };
}

describe("buildGithubDetail", () => {
  it("omits rows of a repo that is no longer part of the property", () => {
    const detail = buildGithubDetail(
      "markpost",
      [statusRow("markpost"), statusRow("markpost-old")],
      [itemRow("markpost", 1), itemRow("markpost-old", 2)],
      true,
    );

    expect(detail.repos.map((repo) => repo.repo)).toEqual([
      "markpost",
      "markpost-cli",
    ]);
    expect(detail.items.map((item) => item.repo)).toEqual(["markpost"]);
  });

  it("keeps the rows' newest-first order", () => {
    const detail = buildGithubDetail(
      "markpost",
      [],
      [itemRow("markpost-cli", 5), itemRow("markpost", 9)],
      true,
    );
    expect(detail.items.map((item) => item.number)).toEqual([5, 9]);
  });
});
