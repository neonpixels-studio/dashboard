import { describe, expect, it } from "vitest";
import {
  nextBranchCursor,
  toNeonBranchList,
  toNeonBranchSummary,
  toNeonProjectUsage,
} from "../../../../server/integrations/neon/mapping";

function projectBody(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      id: "proj-1",
      compute_time_seconds: 93_600,
      active_time_seconds: 309_600,
      synthetic_storage_size: 0,
      data_transfer_bytes: 18_874_368,
      written_data_bytes: 1_000,
      consumption_period_start: "2026-10-01T00:00:00Z",
      consumption_period_end: "2026-11-01T00:00:00Z",
      ...overrides,
    },
  };
}

describe("toNeonProjectUsage", () => {
  it("reads the usage fields and parses the billing period", () => {
    expect(toNeonProjectUsage(projectBody())).toEqual({
      computeTimeSeconds: 93_600,
      activeTimeSeconds: 309_600,
      syntheticStorageBytes: 0,
      dataTransferBytes: 18_874_368,
      writtenDataBytes: 1_000,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      periodEnd: new Date("2026-11-01T00:00:00Z"),
    });
  });

  it.each([
    "compute_time_seconds",
    "active_time_seconds",
    "synthetic_storage_size",
    "data_transfer_bytes",
    "written_data_bytes",
  ])("fails loud rather than recording a zero when %s is missing", (field) => {
    expect(() =>
      toNeonProjectUsage(projectBody({ [field]: undefined })),
    ).toThrow(field);
  });

  it("rejects a negative number", () => {
    expect(() =>
      toNeonProjectUsage(projectBody({ compute_time_seconds: -1 })),
    ).toThrow(/compute_time_seconds/);
  });

  it("rejects an unparseable billing period", () => {
    expect(() =>
      toNeonProjectUsage(projectBody({ consumption_period_end: "soon" })),
    ).toThrow(/consumption_period_end/);
  });

  it("rejects a body without a project", () => {
    expect(() => toNeonProjectUsage({})).toThrow(/project/);
    expect(() => toNeonProjectUsage(null)).toThrow(/project response/);
  });
});

describe("toNeonBranchSummary", () => {
  it("reads name, creation date and logical size", () => {
    expect(
      toNeonBranchSummary({
        name: "production",
        created_at: "2026-07-01T00:00:00Z",
        logical_size: 31_000_000,
      }),
    ).toEqual({
      name: "production",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      logicalSizeBytes: 31_000_000,
    });
  });

  it("tolerates a missing size and an unusable date", () => {
    expect(toNeonBranchSummary({ name: "e2e", created_at: "nope" })).toEqual({
      name: "e2e",
      createdAt: null,
      logicalSizeBytes: 0,
    });
  });

  it("fails loud on a branch with no name", () => {
    expect(() => toNeonBranchSummary({ id: "br-1" })).toThrow(/name/);
  });
});

describe("branch list pagination", () => {
  it("maps the branches array", () => {
    expect(
      toNeonBranchList({ branches: [{ name: "a" }, { name: "b" }] }),
    ).toHaveLength(2);
  });

  it("rejects a body without a branches array", () => {
    expect(() => toNeonBranchList({ branches: "nope" })).toThrow(/branches/);
  });

  it("reads the next cursor, and null on the last page", () => {
    expect(nextBranchCursor({ branches: [], pagination: { next: "c2" } })).toBe(
      "c2",
    );
    expect(nextBranchCursor({ branches: [], pagination: {} })).toBeNull();
    expect(nextBranchCursor({ branches: [] })).toBeNull();
  });
});
