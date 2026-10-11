import type { DatabasePanel } from "../../shared/types/database";

// 26 of 100 CU-hours used ten days into a 31-day period projects to ~81, which
// is past the 80% alert line; callers override fields for the other cases.
export function databasePanelFixture(
  overrides: Partial<DatabasePanel> = {},
): DatabasePanel {
  return {
    slug: "basin",
    capturedAt: "2026-10-10T12:00:00.000Z",
    periodStart: "2026-10-01T00:00:00.000Z",
    periodEnd: "2026-11-01T00:00:00.000Z",
    compute: {
      usedCuHours: 24,
      allowanceCuHours: 100,
      projectedCuHours: 61.5,
      periodEnded: false,
    },
    storage: { usedBytes: 31 * 1024 ** 2, allowanceBytes: 1024 ** 3 },
    dataTransferBytes: 9 * 1024 ** 2,
    branches: [
      { name: "development", createdAt: "2026-08-01T00:00:00.000Z" },
      { name: "production", createdAt: "2026-07-01T00:00:00.000Z" },
    ],
    alerts: [],
    ...overrides,
  };
}
