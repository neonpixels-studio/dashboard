import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { databasePanelFixture } from "../../../support/databasePanelFixture";

const mockRequireUser = vi.fn();
vi.mock("../../../../server/utils/auth", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("../../../../server/db", () => ({ useDb: () => ({}) }));

const mockListSyncHealthRows = vi.fn();
vi.mock("../../../../server/integrations/persist", () => ({
  listSyncHealthRows: mockListSyncHealthRows,
}));

const mockFetchEnabledDatabasePanels = vi.fn();
vi.mock("../../../../server/utils/databasePanels", () => ({
  fetchEnabledDatabasePanels: mockFetchEnabledDatabasePanels,
}));

const { default: alertsHandler } =
  await import("../../../../server/api/overview/alerts.get");

describe("GET /api/overview/alerts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListSyncHealthRows.mockResolvedValue([]);
    mockFetchEnabledDatabasePanels.mockResolvedValue([]);
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(alertsHandler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockListSyncHealthRows).not.toHaveBeenCalled();
  });

  it("returns an empty list when everything is healthy", async () => {
    expect(await alertsHandler({} as H3Event)).toEqual([]);
  });

  it("returns an alert for a failing sync_status row", async () => {
    mockListSyncHealthRows.mockResolvedValue([
      {
        slug: "basin",
        vendor: "stripe",
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastAttemptedAt: null,
        ok: false,
        error: "stripe: 401",
      },
    ]);

    const result = await alertsHandler({} as H3Event);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: "basin",
      source: "stripe",
      message: "stripe: 401",
      href: "/apps/basin",
    });
  });

  it("raises Neon alerts from the enabled databases", async () => {
    mockFetchEnabledDatabasePanels.mockResolvedValue([
      databasePanelFixture({
        alerts: [{ id: "branches", message: "Unexpected branch: agent-x" }],
      }),
    ]);

    const result = await alertsHandler({} as H3Event);

    expect(result).toEqual([
      expect.objectContaining({
        id: "neon-branches:basin",
        slug: "basin",
        source: "neon",
        message: "Unexpected branch: agent-x",
        href: "/apps/basin",
      }),
    ]);
  });

  it("looks for Neon databases across every property and internal app", async () => {
    await alertsHandler({} as H3Event);

    expect(mockFetchEnabledDatabasePanels).toHaveBeenCalledWith({}, [
      "basin",
      "markpost",
      "farflung",
      "danholloran",
      "grimicorn",
      "neonpixels",
      "dashboard",
    ]);
  });

  it("merges sync and Neon alerts, newest first", async () => {
    mockListSyncHealthRows.mockResolvedValue([
      {
        slug: "basin",
        vendor: "stripe",
        lastRunAt: new Date("2026-10-10T08:00:00Z"),
        lastSuccessAt: null,
        lastAttemptedAt: new Date("2026-10-10T08:00:00Z"),
        ok: false,
        error: "stripe: 401",
      },
    ]);
    mockFetchEnabledDatabasePanels.mockResolvedValue([
      databasePanelFixture({
        capturedAt: "2026-10-10T12:00:00.000Z",
        alerts: [{ id: "storage", message: "Storage at 85%" }],
      }),
    ]);

    const result = await alertsHandler({} as H3Event);

    expect(result.map((alert) => alert.id)).toEqual([
      "neon-storage:basin",
      "sync-failed:basin:stripe",
    ]);
  });
});
