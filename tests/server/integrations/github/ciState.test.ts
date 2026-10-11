import { describe, expect, it } from "vitest";
import {
  rollupCommitStatus,
  rollupMainCi,
  rollupWorkflowRuns,
  type WorkflowRun,
} from "../../../../server/integrations/github/ciState";

let nextWorkflowId = 1;

// Each call is a distinct workflow unless a test pins workflowId.
function run(
  status: string,
  conclusion: string | null,
  event = "push",
  extra: Partial<WorkflowRun> = {},
): WorkflowRun {
  return {
    workflowId: nextWorkflowId++,
    createdAt: "2026-10-09T08:00:00Z",
    status,
    conclusion,
    event,
    ...extra,
  };
}

const NO_STATUSES = { state: "pending", totalCount: 0 };

describe("rollupWorkflowRuns", () => {
  it("is passing when every run completed successfully", () => {
    expect(
      rollupWorkflowRuns([
        run("completed", "success"),
        run("completed", "skipped"),
      ]),
    ).toBe("passing");
  });

  it.each(["failure", "timed_out", "startup_failure"])(
    "is failing when one of several runs concluded %s",
    (conclusion) => {
      expect(
        rollupWorkflowRuns([
          run("completed", "success"),
          run("completed", conclusion),
          run("completed", "success"),
        ]),
      ).toBe("failing");
    },
  );

  it("is pending when a run has not completed and none failed", () => {
    expect(
      rollupWorkflowRuns([
        run("completed", "success"),
        run("in_progress", null),
      ]),
    ).toBe("pending");
  });

  it("is failing, not pending, when one run failed while another still runs", () => {
    expect(
      rollupWorkflowRuns([
        run("in_progress", null),
        run("completed", "failure"),
      ]),
    ).toBe("failing");
  });

  it("does not count Dependabot's dynamic runs", () => {
    expect(
      rollupWorkflowRuns([
        run("completed", "success"),
        run("completed", "failure", "dynamic"),
        run("in_progress", null, "dynamic"),
      ]),
    ).toBe("passing");
  });

  it("lets a newer passing run of a workflow supersede its older failure", () => {
    const older = run("completed", "failure", "schedule", {
      workflowId: 7,
      createdAt: "2026-10-08T00:00:00Z",
    });
    const newer = run("completed", "success", "schedule", {
      workflowId: 7,
      createdAt: "2026-10-09T00:00:00Z",
    });
    expect(rollupWorkflowRuns([older, newer])).toBe("passing");
    expect(rollupWorkflowRuns([newer, older])).toBe("passing");
  });

  it("still fails when the newest run of a workflow failed", () => {
    const older = run("completed", "success", "schedule", {
      workflowId: 7,
      createdAt: "2026-10-08T00:00:00Z",
    });
    const newer = run("completed", "failure", "schedule", {
      workflowId: 7,
      createdAt: "2026-10-09T00:00:00Z",
    });
    expect(rollupWorkflowRuns([newer, older])).toBe("failing");
  });

  it("does not let a failure in one workflow hide behind another's success", () => {
    expect(
      rollupWorkflowRuns([
        run("completed", "failure", "push", { workflowId: 1 }),
        run("completed", "success", "push", { workflowId: 2 }),
      ]),
    ).toBe("failing");
  });

  it("is pending while a run awaits approval", () => {
    expect(
      rollupWorkflowRuns([
        run("completed", "success"),
        run("completed", "action_required"),
      ]),
    ).toBe("pending");
  });

  it.each(["cancelled", "stale"])(
    "gives a %s run no say, so it never reads as passing",
    (conclusion) => {
      expect(rollupWorkflowRuns([run("completed", conclusion)])).toBeNull();
    },
  );

  it("lets a cancelled run beside a failure leave the failure standing", () => {
    expect(
      rollupWorkflowRuns([
        run("completed", "cancelled"),
        run("completed", "failure"),
      ]),
    ).toBe("failing");
  });

  it("has no signal when there are no runs or only dynamic ones", () => {
    expect(rollupWorkflowRuns([])).toBeNull();
    expect(
      rollupWorkflowRuns([run("completed", "failure", "dynamic")]),
    ).toBeNull();
  });
});

describe("rollupCommitStatus", () => {
  it("treats an empty combined status as no statuses, not pending", () => {
    expect(rollupCommitStatus(NO_STATUSES)).toBeNull();
  });

  it.each(["failure", "error"])("maps %s to failing", (state) => {
    expect(rollupCommitStatus({ state, totalCount: 2 })).toBe("failing");
  });

  it("maps pending with statuses to pending and success to passing", () => {
    expect(rollupCommitStatus({ state: "pending", totalCount: 1 })).toBe(
      "pending",
    );
    expect(rollupCommitStatus({ state: "success", totalCount: 1 })).toBe(
      "passing",
    );
  });
});

describe("rollupMainCi", () => {
  it("is passing for green runs and no commit statuses (markpost-cli)", () => {
    expect(rollupMainCi([run("completed", "success")], NO_STATUSES)).toBe(
      "passing",
    );
  });

  it("is failing when the runs are green but a commit status failed", () => {
    expect(
      rollupMainCi([run("completed", "success")], {
        state: "failure",
        totalCount: 1,
      }),
    ).toBe("failing");
  });

  it("is failing when the status is green but one run failed", () => {
    expect(
      rollupMainCi([run("completed", "failure")], {
        state: "success",
        totalCount: 1,
      }),
    ).toBe("failing");
  });

  it("is pending while a run is in flight, even with a green status", () => {
    expect(
      rollupMainCi([run("queued", null)], { state: "success", totalCount: 1 }),
    ).toBe("pending");
  });

  it("is none when there are neither runs nor statuses", () => {
    expect(rollupMainCi([], NO_STATUSES)).toBe("none");
  });

  it("is none, not passing, when only dynamic runs exist", () => {
    expect(
      rollupMainCi([run("completed", "success", "dynamic")], NO_STATUSES),
    ).toBe("none");
  });
});
