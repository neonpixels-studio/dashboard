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

const mockListSyncHealthRows = vi.fn();
vi.mock("../../../server/integrations/persist", () => ({
  listSyncHealthRows: mockListSyncHealthRows,
}));

const mockAlertOnStaleVendors = vi.fn();
vi.mock("../../../server/integrations/staleVendorAlert", () => ({
  alertOnStaleVendors: mockAlertOnStaleVendors,
}));

const mockPruneOldSnapshots = vi.fn();
vi.mock("../../../server/integrations/retention", () => ({
  pruneOldSnapshots: mockPruneOldSnapshots,
}));

const mockReportError = vi.fn();
vi.mock("../../../server/utils/errorReporting", () => ({
  reportError: mockReportError,
}));

const { default: syncHandler } = await import("../../../server/api/sync.post");

describe("POST /api/sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAlertOnStaleVendors.mockResolvedValue([]);
    mockPruneOldSnapshots.mockResolvedValue({});
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

  it("checks for stale vendors after the sync using the real db", async () => {
    const summary = { outcomes: [], skipped: [] };
    mockRunSync.mockResolvedValue(summary);
    mockListSyncHealthRows.mockResolvedValue([]);

    const result = await syncHandler({} as H3Event);

    expect(result).toBe(summary);
    expect(mockRunSync.mock.invocationCallOrder[0]).toBeLessThan(
      mockAlertOnStaleVendors.mock.invocationCallOrder[0]!,
    );
    expect(mockAlertOnStaleVendors).toHaveBeenCalledTimes(1);
    const deps = mockAlertOnStaleVendors.mock.calls[0]![0];
    await deps.listSyncHealthRows();
    expect(mockListSyncHealthRows).toHaveBeenCalledWith(FAKE_DB);
  });

  it("still returns the summary when the stale vendor check rejects", async () => {
    const summary = { outcomes: [], skipped: [] };
    mockRunSync.mockResolvedValue(summary);
    const failure = new Error("boom");
    mockAlertOnStaleVendors.mockRejectedValue(failure);

    await expect(syncHandler({} as H3Event)).resolves.toBe(summary);
    expect(mockReportError).toHaveBeenCalledWith(
      "sync: stale vendor alert failed",
      failure,
    );
  });

  it("still checks for stale vendors when the sync itself rejects", async () => {
    const failure = new Error("sync crashed");
    mockRunSync.mockRejectedValue(failure);

    await expect(syncHandler({} as H3Event)).rejects.toBe(failure);
    expect(mockAlertOnStaleVendors).toHaveBeenCalledTimes(1);
  });

  it("prunes old snapshots with the real db after the sync", async () => {
    mockRunSync.mockResolvedValue({ outcomes: [], skipped: [] });

    await syncHandler({} as H3Event);

    expect(mockPruneOldSnapshots).toHaveBeenCalledWith(FAKE_DB);
    expect(mockRunSync.mock.invocationCallOrder[0]).toBeLessThan(
      mockPruneOldSnapshots.mock.invocationCallOrder[0]!,
    );
  });

  it("still returns the summary when the prune rejects", async () => {
    const summary = { outcomes: [], skipped: [] };
    mockRunSync.mockResolvedValue(summary);
    const failure = new Error("prune boom");
    mockPruneOldSnapshots.mockRejectedValue(failure);

    await expect(syncHandler({} as H3Event)).resolves.toBe(summary);
    expect(mockReportError).toHaveBeenCalledWith(
      "sync: snapshot retention prune failed",
      failure,
    );
  });

  it("still prunes when the stale vendor check rejects", async () => {
    mockRunSync.mockResolvedValue({ outcomes: [], skipped: [] });
    mockAlertOnStaleVendors.mockRejectedValue(new Error("alert boom"));

    await syncHandler({} as H3Event);

    expect(mockPruneOldSnapshots).toHaveBeenCalledTimes(1);
  });
});
