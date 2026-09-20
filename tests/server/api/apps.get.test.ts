import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { APPS } from "../../../app/config/apps";
import type {
  MetricSnapshotRow,
  SyncStatusRow,
} from "../../../server/utils/dashboardQueries";

const mockRequireUser = vi.fn();
vi.mock("../../../server/utils/auth", () => ({ requireUser: mockRequireUser }));

vi.mock("../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchMetricSnapshots = vi.fn();
const mockFetchSyncStatuses = vi.fn();
const mockFetchIntegrationConfigs = vi.fn();
vi.mock("../../../server/utils/dashboardQueries", () => ({
  fetchMetricSnapshots: mockFetchMetricSnapshots,
  fetchSyncStatuses: mockFetchSyncStatuses,
  fetchIntegrationConfigs: mockFetchIntegrationConfigs,
}));

const { default: appsHandler } = await import("../../../server/api/apps.get");

describe("GET /api/apps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchMetricSnapshots.mockResolvedValue([]);
    mockFetchSyncStatuses.mockResolvedValue([]);
    mockFetchIntegrationConfigs.mockResolvedValue([]);
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(appsHandler({} as H3Event)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchMetricSnapshots).not.toHaveBeenCalled();
  });

  it("returns one NOT SYNCED card per configured app when the db is empty", async () => {
    const result = await appsHandler({} as H3Event);

    expect(result).toEqual(
      APPS.map((app) => ({
        slug: app.slug,
        status: { label: "NOT SYNCED", tone: "muted" },
        metrics: [],
        sparklines: [],
        integrations: [],
      })),
    );
  });

  it("scopes each card's metrics/status/integrations to its own slug", async () => {
    const metricRow: MetricSnapshotRow = {
      id: 1,
      slug: "basin",
      vendor: "stripe",
      metric: "mrr",
      value: 412,
      period: "current",
      capturedAt: new Date("2026-09-01T00:00:00Z"),
    };
    const syncRow: SyncStatusRow = {
      id: 1,
      slug: "basin",
      vendor: "stripe",
      lastRunAt: new Date("2026-09-19T00:00:00Z"),
      lastSuccessAt: new Date("2026-09-19T00:00:00Z"),
      ok: true,
      error: null,
    };
    mockFetchMetricSnapshots.mockResolvedValue([metricRow]);
    mockFetchSyncStatuses.mockResolvedValue([syncRow]);

    const result = await appsHandler({} as H3Event);
    const basinCard = result.find((card) => card.slug === "basin");
    const otherCard = result.find((card) => card.slug === "markpost");

    expect(basinCard?.status).toEqual({ label: "LIVE", tone: "ok" });
    expect(basinCard?.metrics).toHaveLength(1);
    expect(otherCard?.status).toEqual({ label: "NOT SYNCED", tone: "muted" });
    expect(otherCard?.metrics).toEqual([]);
  });
});
