import type { GithubCiState } from "../../../shared/types/dashboard";
import { combineCiStates } from "../../../shared/utils/githubCi";

// Dependabot's own update jobs also run against main under this event and are
// not CI.
const IGNORED_RUN_EVENT = "dynamic";
const COMPLETED_STATUS = "completed";
const FAILING_CONCLUSIONS = new Set([
  "failure",
  "timed_out",
  "startup_failure",
]);
// A cancelled or superseded run says nothing about the commit, so it is no
// signal at all.
const NO_SIGNAL_CONCLUSIONS = new Set(["cancelled", "stale"]);
// Waiting on a human approval: not done, not failed.
const PENDING_CONCLUSIONS = new Set(["action_required"]);
const FAILING_COMMIT_STATES = new Set(["failure", "error"]);

export interface WorkflowRun {
  workflowId: number;
  createdAt: string;
  status: string;
  conclusion: string | null;
  event: string;
}

export interface CombinedCommitStatus {
  state: string;
  totalCount: number;
}

function runState(run: WorkflowRun): GithubCiState | null {
  if (run.status !== COMPLETED_STATUS) {
    return "pending";
  }
  if (!run.conclusion || NO_SIGNAL_CONCLUSIONS.has(run.conclusion)) {
    return null;
  }
  if (FAILING_CONCLUSIONS.has(run.conclusion)) {
    return "failing";
  }
  return PENDING_CONCLUSIONS.has(run.conclusion) ? "pending" : "passing";
}

// A commit can carry several runs of one workflow (scheduled and manual
// ones); only the newest says where that workflow stands now.
function newerRun(run: WorkflowRun, current: WorkflowRun | undefined) {
  if (!current || Date.parse(run.createdAt) > Date.parse(current.createdAt)) {
    return run;
  }
  return current;
}

function newestRunPerWorkflow(runs: WorkflowRun[]): WorkflowRun[] {
  const newestByWorkflow = new Map<number, WorkflowRun>();
  for (const run of runs) {
    const current = newestByWorkflow.get(run.workflowId);
    newestByWorkflow.set(run.workflowId, newerRun(run, current));
  }
  return [...newestByWorkflow.values()];
}

// Null when there is no Actions signal at all (no runs, or only ignored ones).
export function rollupWorkflowRuns(runs: WorkflowRun[]): GithubCiState | null {
  const ciRuns = runs.filter((run) => run.event !== IGNORED_RUN_EVENT);
  return combineCiStates(newestRunPerWorkflow(ciRuns).map(runState));
}

// GitHub reports "pending" for a commit with no statuses at all; that is
// "no statuses", not a pending build, so it yields null.
export function rollupCommitStatus(
  status: CombinedCommitStatus,
): GithubCiState | null {
  if (status.totalCount === 0) {
    return null;
  }
  if (FAILING_COMMIT_STATES.has(status.state)) {
    return "failing";
  }
  return status.state === "success" ? "passing" : "pending";
}

export function rollupMainCi(
  runs: WorkflowRun[],
  status: CombinedCommitStatus,
): GithubCiState {
  const combined = combineCiStates([
    rollupWorkflowRuns(runs),
    rollupCommitStatus(status),
  ]);
  return combined ?? "none";
}
