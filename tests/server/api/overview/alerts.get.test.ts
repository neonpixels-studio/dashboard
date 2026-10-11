import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const mockRequireUser = vi.fn();
vi.mock("../../../../server/utils/auth", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("../../../../server/db", () => ({ useDb: () => ({}) }));

const mockListSyncHealthRows = vi.fn();
vi.mock("../../../../server/integrations/persist", () => ({
  listSyncHealthRows: mockListSyncHealthRows,
}));

const mockFetchDeployStatuses = vi.fn();
vi.mock("../../../../server/utils/dashboardQueries", () => ({
  fetchDeployStatuses: mockFetchDeployStatuses,
}));

const { default: alertsHandler } =
  await import("../../../../server/api/overview/alerts.get");

describe("GET /api/overview/alerts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListSyncHealthRows.mockResolvedValue([]);
    mockFetchDeployStatuses.mockResolvedValue([]);
    vi.stubEnv("NUXT_NETLIFY_TOKEN", "nfp_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("returns a deploy alert for a failed latest production deploy, linked to Netlify", async () => {
    mockFetchDeployStatuses.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        deployId: "abc123",
        state: "error",
        finishedAt: new Date("2026-10-10T12:00:00Z"),
      },
    ]);

    const result = await alertsHandler({} as H3Event);

    expect(result).toEqual([
      {
        id: "deploy-failed:basin",
        slug: "basin",
        source: "netlify",
        message: "Production deploy failed",
        occurredAt: "2026-10-10T12:00:00.000Z",
        href: "https://app.netlify.com/projects/basin-fm/deploys/abc123",
      },
    ]);
  });

  it("does not alert for a successful or in-progress deploy", async () => {
    mockFetchDeployStatuses.mockResolvedValue([
      { id: 1, slug: "basin", deployId: "a", state: "ready", finishedAt: null },
      {
        id: 2,
        slug: "markpost",
        deployId: "b",
        state: "building",
        finishedAt: null,
      },
    ]);

    expect(await alertsHandler({} as H3Event)).toEqual([]);
  });

  it("drops deploy alerts when the token is no longer configured, matching the detail tile", async () => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", "");
    mockFetchDeployStatuses.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        deployId: "abc123",
        state: "error",
        finishedAt: new Date("2026-10-10T12:00:00Z"),
      },
    ]);

    expect(await alertsHandler({} as H3Event)).toEqual([]);
    expect(mockFetchDeployStatuses).not.toHaveBeenCalled();
  });
});
