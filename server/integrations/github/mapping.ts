import type { GithubItemInput } from "./types";
import type { CombinedCommitStatus, WorkflowRun } from "./ciState";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`GitHub ${what} is not an object.`);
  }
  return value;
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  what: string,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`GitHub ${what} is missing a string "${field}" field.`);
  }
  return value;
}

function requireNumber(
  record: Record<string, unknown>,
  field: string,
  what: string,
): number {
  const value = record[field];
  if (typeof value !== "number") {
    throw new Error(`GitHub ${what} is missing a number "${field}" field.`);
  }
  return value;
}

function requireDate(
  record: Record<string, unknown>,
  field: string,
  what: string,
): Date {
  const date = new Date(requireString(record, field, what));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`GitHub ${what} has an unparseable "${field}" date.`);
  }
  return date;
}

function labelName(label: unknown): string | null {
  if (typeof label === "string") {
    return label;
  }
  if (isRecord(label) && typeof label.name === "string") {
    return label.name;
  }
  return null;
}

function toLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(labelName).filter((name) => name !== null);
}

// The issues endpoint returns pull requests too, flagged by `pull_request`.
export function toGithubItem(raw: unknown): GithubItemInput {
  const what = "issue";
  const record = requireRecord(raw, what);
  return {
    number: requireNumber(record, "number", what),
    kind: record.pull_request ? "pr" : "issue",
    title: requireString(record, "title", what),
    url: requireString(record, "html_url", what),
    labels: toLabels(record.labels),
    itemUpdatedAt: requireDate(record, "updated_at", what),
  };
}

// Pages are fetched while items change, so an item can appear on two pages.
export function dedupeItemsByNumber(items: GithubItemInput[]) {
  const itemsByNumber = new Map(items.map((item) => [item.number, item]));
  return [...itemsByNumber.values()];
}

// The runs of one page of GET /actions/runs, which wraps them in an object.
export function pickWorkflowRuns(raw: unknown): unknown[] {
  const body = requireRecord(raw, "workflow runs response");
  const runs = body.workflow_runs;
  if (!Array.isArray(runs)) {
    throw new Error('GitHub workflow runs response has no "workflow_runs".');
  }
  return runs;
}

export function toWorkflowRun(rawRun: unknown): WorkflowRun {
  const run = requireRecord(rawRun, "workflow run");
  return {
    workflowId: requireNumber(run, "workflow_id", "workflow run"),
    createdAt: requireString(run, "created_at", "workflow run"),
    status: requireString(run, "status", "workflow run"),
    conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
    event: requireString(run, "event", "workflow run"),
  };
}

export function toCombinedStatus(raw: unknown): CombinedCommitStatus {
  const body = requireRecord(raw, "combined status");
  return {
    state: requireString(body, "state", "combined status"),
    totalCount: requireNumber(body, "total_count", "combined status"),
  };
}

export interface MainCommit {
  sha: string;
  commitAt: Date;
}

export function toMainCommit(raw: unknown): MainCommit {
  const body = requireRecord(raw, "commit");
  const commit = requireRecord(body.commit, "commit.commit");
  const committer = requireRecord(commit.committer, "commit.committer");
  return {
    sha: requireString(body, "sha", "commit"),
    commitAt: requireDate(committer, "date", "commit.committer"),
  };
}
