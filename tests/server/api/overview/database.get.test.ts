import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { databasePanelFixture } from "../../../support/databasePanelFixture";

const mockRequireUser = vi.fn();
vi.mock("../../../../server/utils/auth", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("../../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchEnabledDatabasePanels = vi.fn();
vi.mock("../../../../server/utils/databasePanels", () => ({
  fetchEnabledDatabasePanels: mockFetchEnabledDatabasePanels,
}));

const { default: databaseHandler } =
  await import("../../../../server/api/overview/database.get");

describe("GET /api/overview/database", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchEnabledDatabasePanels.mockResolvedValue([]);
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(databaseHandler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchEnabledDatabasePanels).not.toHaveBeenCalled();
  });

  it("returns null until the dashboard's Neon sync has run", async () => {
    expect(await databaseHandler({} as H3Event)).toBeNull();
  });

  it("returns the dashboard's own panel, scoped to the dashboard slug", async () => {
    const panel = databasePanelFixture({ slug: "dashboard" });
    mockFetchEnabledDatabasePanels.mockResolvedValue([panel]);

    expect(await databaseHandler({} as H3Event)).toEqual(panel);
    expect(mockFetchEnabledDatabasePanels).toHaveBeenCalledWith({}, [
      "dashboard",
    ]);
  });
});
