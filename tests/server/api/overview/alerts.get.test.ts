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

const mockFetchIntegrationConfigs = vi.fn();
vi.mock("../../../../server/utils/dashboardQueries", () => ({
  fetchIntegrationConfigs: mockFetchIntegrationConfigs,
}));

const mockFetchDatabasePanels = vi.fn();
vi.mock("../../../../server/utils/databasePanels", () => ({
  fetchDatabasePanels: mockFetchDatabasePanels,
}));

const { default: alertsHandler } =
  await import("../../../../server/api/overview/alerts.get");

function neonConfigRow(slug: string, enabled: boolean) {
  return { slug, vendor: "neon", enabled };
}

describe("GET /api/overview/alerts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListSyncHealthRows.mockResolvedValue([]);
    mockFetchIntegrationConfigs.mockResolvedValue([]);
    mockFetchDatabasePanels.mockResolvedValue([]);
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

  it("raises Neon alerts for properties whose Neon integration is enabled", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      neonConfigRow("basin", true),
      neonConfigRow("markpost", false),
    ]);
    mockFetchDatabasePanels.mockResolvedValue([
      databasePanelFixture({
        alerts: [{ id: "branches", message: "Unexpected branch: agent-x" }],
      }),
    ]);

    const result = await alertsHandler({} as H3Event);

    expect(mockFetchDatabasePanels).toHaveBeenCalledWith({}, ["basin"]);
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

  it("does not look up Neon usage for a disabled integration", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      neonConfigRow("basin", false),
    ]);

    await alertsHandler({} as H3Event);

    expect(mockFetchDatabasePanels).toHaveBeenCalledWith({}, []);
  });
});
