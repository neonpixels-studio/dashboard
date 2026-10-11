import { describe, expect, it } from "vitest";
import { createGithubClient } from "../../../../server/integrations/github/githubClient";
import { fetchRepoSnapshot } from "../../../../server/integrations/github/snapshot";
import {
  fakeGithubFetch,
  jsonOk,
  mainCiRoutes,
  rawIssue,
  rawPull,
} from "./fakeGithubFetch";

const SYNCED_AT = new Date("2026-10-10T00:00:00Z");
const ISSUES_PATH = "/repos/neonpixels-studio/basin/issues";

function snapshotFor(routes: Parameters<typeof fakeGithubFetch>[0]) {
  const { fetchImpl, requests } = fakeGithubFetch(routes);
  const client = createGithubClient({ token: "t", fetchImpl });
  return {
    requests,
    snapshot: () => fetchRepoSnapshot(client, "basin", SYNCED_AT),
  };
}

describe("fetchRepoSnapshot", () => {
  it("splits issues from pull requests and counts each", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: [
        rawIssue(1),
        rawPull(2),
        rawIssue(3, { labels: [{ name: "bug" }, "p1"] }),
        rawPull(4),
        rawPull(5),
      ],
      ...mainCiRoutes("basin"),
    });

    const result = await snapshot();

    expect(result.openIssues).toBe(2);
    expect(result.openPrs).toBe(3);
    expect(result.items.map((item) => [item.number, item.kind])).toEqual([
      [1, "issue"],
      [2, "pr"],
      [3, "issue"],
      [4, "pr"],
      [5, "pr"],
    ]);
    expect(result.items[2]).toMatchObject({
      title: "Item 3",
      url: "https://github.com/neonpixels-studio/basin/issues/3",
      labels: ["bug", "p1"],
    });
  });

  it("covers every page of open items, not just the first", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: (url) => {
        if (url.searchParams.get("page") === "2") {
          return jsonOk([rawIssue(101), rawPull(102)]);
        }
        return jsonOk(
          Array.from({ length: 100 }, (_, index) => rawIssue(index + 1)),
          {
            link: `<https://api.github.com${ISSUES_PATH}?page=2&per_page=100>; rel="next"`,
          },
        );
      },
      ...mainCiRoutes("basin"),
    });

    const result = await snapshot();

    expect(result.openIssues).toBe(101);
    expect(result.openPrs).toBe(1);
    expect(result.items).toHaveLength(102);
  });

  it("keeps one row when an item shifts onto two pages mid-sync", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: (url) => {
        if (url.searchParams.get("page") === "2") {
          return jsonOk([rawIssue(2), rawIssue(3)]);
        }
        return jsonOk([rawIssue(1), rawIssue(2)], {
          link: `<https://api.github.com${ISSUES_PATH}?page=2>; rel="next"`,
        });
      },
      ...mainCiRoutes("basin"),
    });

    const result = await snapshot();

    expect(result.items.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(result.openIssues).toBe(3);
  });

  it("asks for open items newest activity first", async () => {
    const { snapshot, requests } = snapshotFor({
      [ISSUES_PATH]: [],
      ...mainCiRoutes("basin"),
    });

    await snapshot();

    const issuesRequest = requests.find(
      (request) => request.url.pathname === ISSUES_PATH,
    )!;
    expect(Object.fromEntries(issuesRequest.url.searchParams)).toMatchObject({
      state: "open",
      sort: "updated",
      direction: "desc",
    });
  });

  it("reads CI from workflow runs of the main head sha, never the Checks API", async () => {
    const { snapshot, requests } = snapshotFor({
      [ISSUES_PATH]: [],
      ...mainCiRoutes("basin", { sha: "deadbeef" }),
    });

    const result = await snapshot();

    expect(result.ci).toEqual({
      state: "passing",
      sha: "deadbeef",
      commitAt: new Date("2026-10-09T08:00:00Z"),
    });
    const runsRequest = requests.find((request) =>
      request.url.pathname.endsWith("/actions/runs"),
    )!;
    expect(runsRequest.url.searchParams.get("head_sha")).toBe("deadbeef");
    expect(
      requests.some((request) => request.url.pathname.includes("check-runs")),
    ).toBe(false);
  });

  it("is failing when one workflow run failed", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: [],
      ...mainCiRoutes("basin", {
        runs: [
          { status: "completed", conclusion: "success", event: "push" },
          { status: "completed", conclusion: "failure", event: "push" },
        ],
      }),
    });

    expect((await snapshot()).ci.state).toBe("failing");
  });

  it("lets a newer passing run supersede an older failing one of the same workflow", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: [],
      ...mainCiRoutes("basin", {
        runs: [
          {
            status: "completed",
            conclusion: "failure",
            event: "schedule",
            workflow_id: 9,
            created_at: "2026-10-08T00:00:00Z",
          },
          {
            status: "completed",
            conclusion: "success",
            event: "schedule",
            workflow_id: 9,
            created_at: "2026-10-09T00:00:00Z",
          },
        ],
      }),
    });

    expect((await snapshot()).ci.state).toBe("passing");
  });

  it("finds a failing push run that only appears on the second page of runs", async () => {
    const runsPath = "/repos/neonpixels-studio/basin/actions/runs";
    const cron = (index: number) => ({
      workflow_id: 2,
      created_at: `2026-10-09T0${index}:00:00Z`,
      status: "completed",
      conclusion: "success",
      event: "schedule",
    });
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: [],
      ...mainCiRoutes("basin"),
      [runsPath]: (url) => {
        if (url.searchParams.get("page") === "2") {
          return jsonOk({
            workflow_runs: [
              {
                workflow_id: 1,
                created_at: "2026-10-08T00:00:00Z",
                status: "completed",
                conclusion: "failure",
                event: "push",
              },
            ],
          });
        }
        return jsonOk(
          { workflow_runs: [cron(5), cron(4)] },
          {
            link: `<https://api.github.com${runsPath}?head_sha=sha-main&page=2>; rel="next"`,
          },
        );
      },
    });

    expect((await snapshot()).ci.state).toBe("failing");
  });

  it("is not pending forever for a repo with no commit statuses", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: [],
      ...mainCiRoutes("basin", { statusState: "pending", statusCount: 0 }),
    });

    expect((await snapshot()).ci.state).toBe("passing");
  });

  it("ignores a failing dynamic (Dependabot) run", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: [],
      ...mainCiRoutes("basin", {
        runs: [
          { status: "completed", conclusion: "success", event: "push" },
          { status: "completed", conclusion: "failure", event: "dynamic" },
        ],
      }),
    });

    expect((await snapshot()).ci.state).toBe("passing");
  });

  it("fails loud on a malformed issue instead of counting it", async () => {
    const { snapshot } = snapshotFor({
      [ISSUES_PATH]: [{ number: 1, html_url: "x", updated_at: "2026-10-09" }],
      ...mainCiRoutes("basin"),
    });

    await expect(snapshot()).rejects.toThrow(/title/);
  });
});
