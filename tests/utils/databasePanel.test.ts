import { describe, expect, it } from "vitest";
import {
  formatCuHours,
  formatDatabaseBytes,
  meterColor,
  meterPct,
  toDatabasePanelView,
} from "../../app/utils/databasePanel";
import { databasePanelFixture } from "../support/databasePanelFixture";

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

describe("formatting", () => {
  it("formats CU-hours to one decimal", () => {
    expect(formatCuHours(26)).toBe("26.0 CU-hours");
  });

  it("formats bytes as MB below a gibibyte and GB from it", () => {
    expect(formatDatabaseBytes(30 * MIB)).toBe("30 MB");
    expect(formatDatabaseBytes(GIB)).toBe("1.00 GB");
    expect(formatDatabaseBytes(5 * GIB)).toBe("5.00 GB");
  });
});

describe("meterPct", () => {
  it("rounds to a whole percent", () => {
    expect(meterPct(26, 100)).toBe(26);
  });

  it("clamps an over-allowance reading to a full bar and never goes negative", () => {
    expect(meterPct(150, 100)).toBe(100);
    expect(meterPct(-5, 100)).toBe(0);
  });

  it("is 0 for a zero allowance rather than dividing by it", () => {
    expect(meterPct(10, 0)).toBe(0);
  });
});

describe("meterColor", () => {
  it("turns red at exactly the alert threshold and stays green below it", () => {
    expect(meterColor(0.8)).toBe("var(--err)");
    expect(meterColor(0.79)).toBe("var(--ok)");
  });
});

describe("toDatabasePanelView", () => {
  it("shows used, allowance and projection for compute, and used and allowance for storage", () => {
    const view = toDatabasePanelView(databasePanelFixture());

    expect(view).toMatchObject({
      computeValue: "24.0 CU-hours of 100.0 CU-hours",
      computePct: 24,
      projectionLabel: "61.5 CU-hours (62%)",
      storageValue: "31 MB of 1.00 GB",
      transferLabel: "9 MB",
    });
  });

  it("colours compute by the projection, not by usage so far", () => {
    const view = toDatabasePanelView(
      databasePanelFixture({
        compute: {
          usedCuHours: 26,
          allowanceCuHours: 100,
          projectedCuHours: 81,
        },
      }),
    );

    expect(view.computePct).toBe(26);
    expect(view.computeColor).toBe("var(--err)");
  });

  it("says so when there is no projection yet, and colours by usage", () => {
    const view = toDatabasePanelView(
      databasePanelFixture({
        compute: {
          usedCuHours: 90,
          allowanceCuHours: 100,
          projectedCuHours: null,
        },
      }),
    );

    expect(view.projectionLabel).toBe("Not enough data yet");
    expect(view.computeColor).toBe("var(--err)");
  });

  it("labels branches with their creation date, and none when there is none", () => {
    const view = toDatabasePanelView(
      databasePanelFixture({
        branches: [
          { name: "production", createdAt: "2026-07-01T00:00:00.000Z" },
          { name: "e2e", createdAt: null },
        ],
      }),
    );

    expect(view.branches).toEqual([
      {
        name: "production",
        createdAt: "2026-07-01T00:00:00.000Z",
        dateLabel: "01 JUL 2026",
      },
      { name: "e2e", createdAt: null, dateLabel: null },
    ]);
  });
});
