import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrizzleDb } from "../../../server/utils/dashboardQueries";

const mockFetchIntegrationConfigs = vi.fn();
const mockFetchNeonUsage = vi.fn();
const mockFetchNeonBranches = vi.fn();
vi.mock("../../../server/utils/dashboardQueries", () => ({
  fetchIntegrationConfigs: mockFetchIntegrationConfigs,
  fetchNeonUsage: mockFetchNeonUsage,
  fetchNeonBranches: mockFetchNeonBranches,
}));

const { fetchEnabledDatabasePanels } =
  await import("../../../server/utils/databasePanels");

const DB = {} as DrizzleDb;

function configRow(slug: string, vendor: string, enabled: boolean) {
  return { slug, vendor, enabled };
}

function usageRow(slug: string) {
  return {
    id: 1,
    slug,
    computeTimeSeconds: 3_600,
    activeTimeSeconds: 0,
    storageBytes: 1_000,
    dataTransferBytes: 0,
    writtenDataBytes: 0,
    periodStart: new Date("2026-10-01T00:00:00Z"),
    periodEnd: new Date("2026-11-01T00:00:00Z"),
    capturedAt: new Date("2026-10-10T00:00:00Z"),
  };
}

describe("fetchEnabledDatabasePanels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchNeonUsage.mockResolvedValue([]);
    mockFetchNeonBranches.mockResolvedValue([]);
  });

  it("reads usage and branches only for slugs whose Neon integration is enabled", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      configRow("basin", "neon", true),
      configRow("markpost", "neon", false),
      configRow("farflung", "sentry", true),
    ]);

    await fetchEnabledDatabasePanels(DB, ["basin", "markpost", "farflung"]);

    expect(mockFetchNeonUsage).toHaveBeenCalledWith(DB, ["basin"]);
    expect(mockFetchNeonBranches).toHaveBeenCalledWith(DB, ["basin"]);
  });

  it("builds one panel per synced slug, attaching its own branches", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      configRow("basin", "neon", true),
    ]);
    mockFetchNeonUsage.mockResolvedValue([usageRow("basin")]);
    mockFetchNeonBranches.mockResolvedValue([
      { id: 1, slug: "basin", name: "agent-x", createdAt: null },
    ]);

    const panels = await fetchEnabledDatabasePanels(DB, ["basin"]);

    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({
      slug: "basin",
      branches: [{ name: "agent-x", createdAt: null }],
      alerts: [{ id: "branches", message: "Unexpected branch: agent-x" }],
    });
  });

  it("returns nothing when no Neon integration is enabled", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      configRow("basin", "neon", false),
    ]);

    expect(await fetchEnabledDatabasePanels(DB, ["basin"])).toEqual([]);
    expect(mockFetchNeonUsage).toHaveBeenCalledWith(DB, []);
  });
});
