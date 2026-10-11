import type { NeonBranchSummary, NeonProjectUsage } from "./types";

function asRecord(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Neon ${what} is not an object.`);
  }
  return raw as Record<string, unknown>;
}

function requireNonNegativeNumber(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Neon project field "${field}" is not a non-negative number.`,
    );
  }
  return value;
}

// Neon documents `synthetic_storage_size` as deprecated and always 0, so its
// absence must not fail the sync: provider.ts falls back to branch sizes.
function optionalPositiveNumber(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  return typeof value === "number" && value > 0 ? value : 0;
}

function requireDate(record: Record<string, unknown>, field: string): Date {
  const value = record[field];
  const parsed = typeof value === "string" ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error(`Neon project field "${field}" is not a valid timestamp.`);
  }
  return parsed;
}

/**
 * Translates `GET /projects/{id}` into the usage fields this provider needs.
 * Fails loud on a missing or malformed field rather than recording a zero:
 * a fabricated 0 CU-hours would read as "all clear" on the panel.
 */
export function toNeonProjectUsage(rawBody: unknown): NeonProjectUsage {
  const project = asRecord(
    asRecord(rawBody, "project response").project,
    "project",
  );
  return {
    computeTimeSeconds: requireNonNegativeNumber(
      project,
      "compute_time_seconds",
    ),
    activeTimeSeconds: requireNonNegativeNumber(project, "active_time_seconds"),
    syntheticStorageBytes: optionalPositiveNumber(
      project,
      "synthetic_storage_size",
    ),
    dataTransferBytes: requireNonNegativeNumber(project, "data_transfer_bytes"),
    writtenDataBytes: requireNonNegativeNumber(project, "written_data_bytes"),
    periodStart: requireDate(project, "consumption_period_start"),
    periodEnd: requireDate(project, "consumption_period_end"),
  };
}

function parseOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toNeonBranchSummary(rawBranch: unknown): NeonBranchSummary {
  const branch = asRecord(rawBranch, "branch");
  if (typeof branch.name !== "string" || !branch.name) {
    throw new Error('Neon branch is missing a string "name" field.');
  }
  const logicalSize = branch.logical_size;
  return {
    name: branch.name,
    createdAt: parseOptionalDate(branch.created_at),
    // logical_size is absent on branches that have not started yet.
    logicalSizeBytes:
      typeof logicalSize === "number" && logicalSize > 0 ? logicalSize : 0,
  };
}

/** The pagination cursor of a branches page, or null on the last page. */
export function nextBranchCursor(rawBody: unknown): string | null {
  const pagination = asRecord(rawBody, "branches response").pagination;
  if (typeof pagination !== "object" || pagination === null) {
    return null;
  }
  const next = (pagination as Record<string, unknown>).next;
  return typeof next === "string" && next ? next : null;
}

export function toNeonBranchList(rawBody: unknown): NeonBranchSummary[] {
  const branches = asRecord(rawBody, "branches response").branches;
  if (!Array.isArray(branches)) {
    throw new Error('Neon branches response has no "branches" array.');
  }
  return branches.map(toNeonBranchSummary);
}
