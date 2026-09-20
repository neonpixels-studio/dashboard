import { describe, expect, it, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const mockRequireSyncTriggerSecret = vi.fn();
vi.mock("../../../server/utils/syncTrigger", () => ({
  requireSyncTriggerSecret: mockRequireSyncTriggerSecret,
}));

const FAKE_DB = { marker: "fake-db" };
vi.mock("../../../server/db", () => ({ useDb: () => FAKE_DB }));

const mockBuildSyncOrchestratorDeps = vi.fn();
vi.mock("../../../server/integrations/syncDeps", () => ({
  buildSyncOrchestratorDeps: mockBuildSyncOrchestratorDeps,
}));

const mockRunSync = vi.fn();
vi.mock("../../../server/integrations/orchestrator", () => ({
  runSync: mockRunSync,
}));

const { default: syncHandler } = await import("../../../server/api/sync.post");

describe("POST /api/sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("checks the trigger secret before doing anything else", async () => {
    mockRequireSyncTriggerSecret.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(syncHandler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockBuildSyncOrchestratorDeps).not.toHaveBeenCalled();
    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it("builds orchestrator deps from the real db and runs the sync", async () => {
    const fakeDeps = { marker: "fake-deps" };
    mockBuildSyncOrchestratorDeps.mockReturnValue(fakeDeps);
    const summary = {
      outcomes: [{ slug: "basin", vendor: "stripe", ok: true }],
    };
    mockRunSync.mockResolvedValue(summary);

    const result = await syncHandler({} as H3Event);

    expect(mockRequireSyncTriggerSecret).toHaveBeenCalled();
    expect(mockBuildSyncOrchestratorDeps).toHaveBeenCalledWith(FAKE_DB);
    expect(mockRunSync).toHaveBeenCalledWith(fakeDeps);
    expect(result).toBe(summary);
  });
});
