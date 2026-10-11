import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDatabasePanel,
  buildNeonOverviewAlerts,
  cuHoursFromSeconds,
  findUnexpectedBranchNames,
  projectComputeCuHours,
} from "../../../server/utils/neonUsage";
import type {
  NeonBranchRow,
  NeonUsageRow,
} from "../../../server/utils/dashboardQueries";

const PERIOD_START = new Date("2026-10-01T00:00:00Z");
const PERIOD_END = new Date("2026-11-01T00:00:00Z");
// Exactly 10 of the period's 31 days elapsed.
const TEN_DAYS_IN = new Date("2026-10-11T00:00:00Z");
const SECONDS_PER_HOUR = 3_600;
const MIB = 1024 ** 2;
const GIB = 1024 ** 3;
// "Now" for every test that does not pass its own, inside the stored period, so
// these never start failing once the real calendar passes November 2026.
const DURING_PERIOD = new Date("2026-10-12T00:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ now: DURING_PERIOD });
});

afterEach(() => {
  vi.useRealTimers();
});

function usageRow(overrides: Partial<NeonUsageRow> = {}): NeonUsageRow {
  return {
    id: 1,
    slug: "basin",
    computeTimeSeconds: 10 * SECONDS_PER_HOUR,
    activeTimeSeconds: 0,
    storageBytes: 30 * MIB,
    dataTransferBytes: 9 * MIB,
    writtenDataBytes: 0,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    capturedAt: TEN_DAYS_IN,
    ...overrides,
  };
}

function branchRows(...names: string[]): NeonBranchRow[] {
  return names.map((name, index) => ({
    id: index + 1,
    slug: "basin",
    name,
    createdAt: new Date("2026-08-01T00:00:00Z"),
  }));
}

describe("cuHoursFromSeconds", () => {
  it("converts CU-seconds to CU-hours", () => {
    expect(cuHoursFromSeconds(90_000)).toBe(25);
  });
});

describe("projectComputeCuHours", () => {
  const base = {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    capturedAt: TEN_DAYS_IN,
  };

  it("scales usage so far by period length over elapsed time", () => {
    // 10 days used 20 CU-hours -> 31 days is 62.
    expect(projectComputeCuHours({ ...base, usedCuHours: 20 })).toBeCloseTo(62);
  });

  it("measures elapsed time at the sync, not at 'now'", () => {
    const fiveDaysIn = new Date("2026-10-06T00:00:00Z");
    expect(
      projectComputeCuHours({
        ...base,
        capturedAt: fiveDaysIn,
        usedCuHours: 20,
      }),
    ).toBeCloseTo(124);
  });

  it("returns null until enough of the period has elapsed to extrapolate", () => {
    const oneHourIn = new Date(PERIOD_START.getTime() + 3_600_000);
    expect(
      projectComputeCuHours({ ...base, capturedAt: oneHourIn, usedCuHours: 5 }),
    ).toBeNull();
  });

  it("returns null for an unusable period", () => {
    expect(
      projectComputeCuHours({
        ...base,
        periodEnd: PERIOD_START,
        usedCuHours: 5,
      }),
    ).toBeNull();
  });

  it("reports the measured usage once the period has ended", () => {
    expect(
      projectComputeCuHours({
        ...base,
        capturedAt: new Date("2026-11-02T00:00:00Z"),
        usedCuHours: 70,
      }),
    ).toBe(70);
  });
});

describe("findUnexpectedBranchNames", () => {
  it("accepts production, development and e2e", () => {
    expect(
      findUnexpectedBranchNames(["production", "development", "e2e"]),
    ).toEqual([]);
  });

  it("flags a leftover agent branch and any other name", () => {
    expect(
      findUnexpectedBranchNames([
        "production",
        "agent-neon-usage-panel",
        "main",
      ]),
    ).toEqual(["agent-neon-usage-panel", "main"]);
  });
});

describe("buildDatabasePanel alerts", () => {
  it("raises no alert for a healthy project with only expected branches", () => {
    const panel = buildDatabasePanel(
      usageRow(),
      branchRows("production", "development", "e2e"),
    );

    expect(panel.alerts).toEqual([]);
  });

  it("alerts when the PROJECTED compute reaches 80% even though usage so far is low", () => {
    // 26 CU-hours after 10 of 31 days projects to ~80.6.
    const panel = buildDatabasePanel(
      usageRow({ computeTimeSeconds: 26 * SECONDS_PER_HOUR }),
      branchRows("production"),
    );

    expect(panel.compute.usedCuHours).toBe(26);
    expect(panel.compute.projectedCuHours).toBeCloseTo(80.6, 1);
    expect(panel.alerts).toEqual([
      {
        id: "compute",
        message:
          "Projected 81 of 100 CU-hours (81% of the free-plan allowance)",
      },
    ]);
  });

  it("does not alert when the projection is just under 80%", () => {
    // 25 CU-hours after 10 of 31 days projects to 77.5.
    const panel = buildDatabasePanel(
      usageRow({ computeTimeSeconds: 25 * SECONDS_PER_HOUR }),
      branchRows("production"),
    );

    expect(panel.compute.projectedCuHours).toBeCloseTo(77.5, 1);
    expect(panel.alerts).toEqual([]);
  });

  it("alerts at exactly 80% of the allowance", () => {
    // Period over, so the projection is the measured 80.
    const panel = buildDatabasePanel(
      usageRow({
        computeTimeSeconds: 80 * SECONDS_PER_HOUR,
        capturedAt: PERIOD_END,
      }),
      [],
    );

    expect(panel.alerts.map((alert) => alert.id)).toEqual(["compute"]);
  });

  it("judges usage so far when it is too early in the period to project", () => {
    const panel = buildDatabasePanel(
      usageRow({
        computeTimeSeconds: 85 * SECONDS_PER_HOUR,
        capturedAt: new Date(PERIOD_START.getTime() + 60_000),
      }),
      [],
    );

    expect(panel.compute.projectedCuHours).toBeNull();
    expect(panel.alerts).toEqual([
      {
        id: "compute",
        message: "Used 85 of 100 CU-hours (85% of the free-plan allowance)",
      },
    ]);
  });

  it("alerts when storage is at 80% of the allowance, not below", () => {
    const atThreshold = buildDatabasePanel(
      usageRow({ storageBytes: Math.ceil(0.8 * GIB) }),
      [],
    );
    const below = buildDatabasePanel(
      usageRow({ storageBytes: Math.floor(0.79 * GIB) }),
      [],
    );

    expect(atThreshold.alerts).toEqual([
      {
        id: "storage",
        message: "Storage at 80% of the 1 GB free-plan allowance",
      },
    ]);
    expect(below.alerts).toEqual([]);
  });

  it("alerts on an unexpected branch and names it", () => {
    const panel = buildDatabasePanel(
      usageRow(),
      branchRows("production", "agent-neon-usage-panel"),
    );

    expect(panel.alerts).toEqual([
      { id: "branches", message: "Unexpected branch: agent-neon-usage-panel" },
    ]);
  });

  it("pluralises and lists several unexpected branches", () => {
    const panel = buildDatabasePanel(
      usageRow(),
      branchRows("agent-a", "agent-b"),
    );

    expect(panel.alerts[0]!.message).toBe(
      "Unexpected branches: agent-a, agent-b",
    );
  });
});

describe("buildDatabasePanel when the stored period has ended", () => {
  const AFTER_PERIOD = new Date("2026-11-03T00:00:00Z");

  it("neither projects nor raises a compute alert from a past period's usage", () => {
    // 85 CU-hours would alert if the period were still current.
    const panel = buildDatabasePanel(
      usageRow({
        computeTimeSeconds: 85 * SECONDS_PER_HOUR,
        capturedAt: new Date("2026-10-31T23:00:00Z"),
      }),
      branchRows("production"),
      AFTER_PERIOD,
    );

    expect(panel.compute.projectedCuHours).toBeNull();
    expect(panel.compute.periodEnded).toBe(true);
    expect(panel.alerts).toEqual([]);
  });

  it("still alerts on storage and branches, which are not per-period", () => {
    const panel = buildDatabasePanel(
      usageRow({ storageBytes: GIB }),
      branchRows("agent-x"),
      AFTER_PERIOD,
    );

    expect(panel.alerts.map((alert) => alert.id)).toEqual([
      "storage",
      "branches",
    ]);
  });
});

describe("buildDatabasePanel shape", () => {
  it("carries the plan allowances, ISO timestamps and name-sorted branches", () => {
    const panel = buildDatabasePanel(
      usageRow({ dataTransferBytes: 18 * MIB }),
      branchRows("production", "development"),
    );

    expect(panel).toMatchObject({
      slug: "basin",
      capturedAt: "2026-10-11T00:00:00.000Z",
      periodStart: "2026-10-01T00:00:00.000Z",
      periodEnd: "2026-11-01T00:00:00.000Z",
      compute: { usedCuHours: 10, allowanceCuHours: 100 },
      storage: { usedBytes: 30 * MIB, allowanceBytes: GIB },
      dataTransferBytes: 18 * MIB,
    });
    expect(panel.branches.map((branch) => branch.name)).toEqual([
      "development",
      "production",
    ]);
    expect(panel.branches[0]!.createdAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("keeps a branch with no creation date", () => {
    const [branch] = branchRows("production");
    const panel = buildDatabasePanel(usageRow(), [
      { ...branch!, createdAt: null },
    ]);

    expect(panel.branches).toEqual([{ name: "production", createdAt: null }]);
  });
});

describe("buildNeonOverviewAlerts", () => {
  it("maps each panel alert to an overview alert linking to the property page", () => {
    const panel = buildDatabasePanel(usageRow(), branchRows("agent-x"));

    expect(buildNeonOverviewAlerts([panel])).toEqual([
      {
        id: "neon-branches:basin",
        slug: "basin",
        source: "neon",
        message: "Unexpected branch: agent-x",
        occurredAt: "2026-10-11T00:00:00.000Z",
        href: "/apps/basin",
      },
    ]);
  });

  it("links the dashboard's own alerts to the overview block, which has no /apps page", () => {
    const panel = buildDatabasePanel(
      usageRow({ slug: "dashboard" }),
      branchRows("agent-x").map((branch) => ({ ...branch, slug: "dashboard" })),
    );

    expect(buildNeonOverviewAlerts([panel])[0]!.href).toBe("/#database");
  });

  it("emits nothing for healthy panels", () => {
    expect(
      buildNeonOverviewAlerts([
        buildDatabasePanel(usageRow(), branchRows("production")),
      ]),
    ).toEqual([]);
  });
});
