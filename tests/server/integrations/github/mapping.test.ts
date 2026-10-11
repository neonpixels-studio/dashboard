import { describe, expect, it } from "vitest";
import {
  toCombinedStatus,
  toGithubItem,
  toMainCommit,
  pickWorkflowRuns,
  toWorkflowRun,
} from "../../../../server/integrations/github/mapping";
import { rawIssue, rawPull } from "./fakeGithubFetch";

describe("toGithubItem", () => {
  it("flags a pull request by its pull_request field", () => {
    expect(toGithubItem(rawIssue(1)).kind).toBe("issue");
    expect(toGithubItem(rawPull(2)).kind).toBe("pr");
  });

  it("reads labels given as objects or strings and drops anything else", () => {
    const item = toGithubItem(
      rawIssue(1, { labels: [{ name: "bug" }, "p1", 7, { id: 1 }] }),
    );
    expect(item.labels).toEqual(["bug", "p1"]);
  });

  it("treats a missing labels array as no labels", () => {
    expect(toGithubItem(rawIssue(1, { labels: undefined })).labels).toEqual([]);
  });

  it.each([
    ["not an object", null, /not an object/],
    ["missing number", rawIssue(1, { number: "1" }), /"number"/],
    ["missing url", rawIssue(1, { html_url: undefined }), /"html_url"/],
    [
      "bad date",
      rawIssue(1, { updated_at: "nope" }),
      /unparseable "updated_at"/,
    ],
  ])("fails loud on %s", (_name, raw, message) => {
    expect(() => toGithubItem(raw)).toThrow(message);
  });
});

describe("pickWorkflowRuns", () => {
  it("fails loud when workflow_runs is not an array", () => {
    expect(() => pickWorkflowRuns({ workflow_runs: {} })).toThrow(
      /workflow_runs/,
    );
  });

  it("returns the wrapped runs", () => {
    expect(pickWorkflowRuns({ workflow_runs: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });
});

describe("toWorkflowRun", () => {
  it("fails loud on a run missing its workflow id", () => {
    expect(() =>
      toWorkflowRun({
        status: "completed",
        event: "push",
        created_at: "2026-10-09",
      }),
    ).toThrow(/"workflow_id"/);
  });

  it("keeps a null conclusion for a run still in flight", () => {
    const run = toWorkflowRun({
      workflow_id: 1,
      created_at: "2026-10-09T00:00:00Z",
      status: "in_progress",
      conclusion: null,
      event: "push",
    });
    expect(run).toMatchObject({ status: "in_progress", conclusion: null });
  });
});

describe("toCombinedStatus", () => {
  it("fails loud without a total_count", () => {
    expect(() => toCombinedStatus({ state: "pending" })).toThrow(/total_count/);
  });
});

describe("toMainCommit", () => {
  it("reads the sha and committer date", () => {
    expect(
      toMainCommit({
        sha: "abc",
        commit: { committer: { date: "2026-10-09T08:00:00Z" } },
      }),
    ).toEqual({ sha: "abc", commitAt: new Date("2026-10-09T08:00:00Z") });
  });

  it("fails loud when the committer is missing", () => {
    expect(() => toMainCommit({ sha: "abc", commit: {} })).toThrow(
      /commit\.committer/,
    );
  });
});
