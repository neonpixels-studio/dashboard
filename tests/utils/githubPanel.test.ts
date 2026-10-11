import { describe, expect, it } from "vitest";
import type {
  GithubDetail,
  GithubRepoSummary,
} from "../../shared/types/dashboard";
import { buildCiRepoRows, buildGithubTiles } from "../../app/utils/githubPanel";

function repo(
  name: string,
  overrides: Partial<GithubRepoSummary> = {},
): GithubRepoSummary {
  return {
    repo: name,
    synced: true,
    openIssues: 0,
    openPrs: 0,
    ciState: "passing",
    ciUrl: `https://github.com/neonpixels-studio/${name}/commit/sha/checks`,
    repoUrl: `https://github.com/neonpixels-studio/${name}`,
    ...overrides,
  };
}

function detail(repos: GithubRepoSummary[]): GithubDetail {
  return {
    configured: true,
    repos,
    issuesUrl: "https://example.test/issues",
    pullsUrl: "https://example.test/pulls",
    items: [],
  };
}

function tile(github: GithubDetail, key: "issues" | "prs" | "ci") {
  return buildGithubTiles(github).find((candidate) => candidate.key === key)!;
}

describe("buildGithubTiles", () => {
  it("shows a single repo's counts linked to its GitHub lists", () => {
    const github = detail([repo("basin", { openIssues: 12, openPrs: 3 })]);

    expect(tile(github, "issues")).toMatchObject({
      value: "12",
      sub: "OPEN · basin",
      href: "https://example.test/issues",
    });
    expect(tile(github, "prs")).toMatchObject({
      value: "3",
      href: "https://example.test/pulls",
    });
  });

  it("sums counts across a multi-repo property", () => {
    const github = detail([
      repo("markpost", { openIssues: 4, openPrs: 1 }),
      repo("markpost-cli", { openIssues: 3, openPrs: 2 }),
    ]);

    expect(tile(github, "issues")).toMatchObject({
      value: "7",
      sub: "OPEN · 2 REPOS",
    });
    expect(tile(github, "prs").value).toBe("3");
  });

  it("shows a dash, not zero, before any repo has synced", () => {
    const github = detail([
      repo("basin", {
        synced: false,
        openIssues: null,
        openPrs: null,
        ciState: null,
      }),
    ]);

    expect(tile(github, "issues")).toMatchObject({
      value: "—",
      sub: "Not synced yet",
    });
    expect(tile(github, "ci")).toMatchObject({
      value: "—",
      tone: undefined,
    });
  });

  it("counts only synced repos and says how many that is", () => {
    const github = detail([
      repo("markpost", { openIssues: 4 }),
      repo("markpost-cli", { synced: false, openIssues: null, ciState: null }),
    ]);

    expect(tile(github, "issues")).toMatchObject({
      value: "4",
      sub: "OPEN · 1 OF 2 REPOS SYNCED",
    });
  });

  it.each([
    ["passing", "PASSING", "ok"],
    ["failing", "FAILING", "danger"],
    ["pending", "PENDING", "warn"],
    ["none", "NO CI", undefined],
  ] as const)("renders %s CI as %s", (ciState, value, tone) => {
    const github = detail([repo("basin", { ciState })]);
    expect(tile(github, "ci")).toMatchObject({ value, tone });
  });

  it("fails the CI tile if any repo fails and links the failing repo's checks", () => {
    const github = detail([
      repo("markpost"),
      repo("markpost-cli", {
        ciState: "failing",
        ciUrl: "https://example.test/cli-checks",
      }),
    ]);

    expect(tile(github, "ci")).toMatchObject({
      value: "FAILING",
      tone: "danger",
      href: "https://example.test/cli-checks",
    });
  });

  it("shows no CI state, linking the first repo, when no repo has synced", () => {
    const github = detail([
      repo("markpost", { synced: false, ciState: null }),
      repo("markpost-cli", { synced: false, ciState: null }),
    ]);

    expect(tile(github, "ci")).toMatchObject({
      value: "—",
      sub: "Not synced yet",
      href: github.repos[0]!.ciUrl,
    });
  });

  it("does not claim the whole property is green while a repo is unsynced", () => {
    const github = detail([
      repo("markpost"),
      repo("markpost-cli", { synced: false, ciState: null }),
    ]);

    expect(tile(github, "ci")).toMatchObject({
      value: "PASSING",
      sub: "MAIN · 1 OF 2 REPOS SYNCED",
    });
  });

  it("is pending when one repo is pending and none failed", () => {
    const github = detail([
      repo("markpost"),
      repo("markpost-cli", { ciState: "pending" }),
    ]);
    expect(tile(github, "ci").value).toBe("PENDING");
  });
});

describe("buildCiRepoRows", () => {
  it("has no breakdown for a single repo", () => {
    expect(buildCiRepoRows(detail([repo("basin")]))).toEqual([]);
  });

  it("lists each repo's CI with its own checks link for a multi-repo property", () => {
    const rows = buildCiRepoRows(
      detail([repo("markpost"), repo("markpost-cli", { ciState: "failing" })]),
    );

    expect(rows).toEqual([
      {
        repo: "markpost",
        label: "markpost: passing",
        href: "https://github.com/neonpixels-studio/markpost/commit/sha/checks",
        tone: "ok",
      },
      {
        repo: "markpost-cli",
        label: "markpost-cli: failing",
        href: "https://github.com/neonpixels-studio/markpost-cli/commit/sha/checks",
        tone: "danger",
      },
    ]);
  });
});
