import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";

const mockReadBody = vi.fn();
vi.mock("h3", () => ({ readBody: mockReadBody }));

const mockRequireBearerSecret = vi.fn();
vi.mock("../../../../server/utils/syncTrigger", () => ({
  requireBearerSecret: mockRequireBearerSecret,
}));

const FAKE_DB = { marker: "fake-db" };
vi.mock("../../../../server/db", () => ({ useDb: () => FAKE_DB }));

const mockFindIntegrationConfig = vi.fn();
const mockPersistProviderResult = vi.fn();
const mockRecordSyncStatus = vi.fn();
vi.mock("../../../../server/integrations/persist", () => ({
  findIntegrationConfig: mockFindIntegrationConfig,
  persistProviderResult: mockPersistProviderResult,
  recordSyncStatus: mockRecordSyncStatus,
}));

const mockReportError = vi.fn();
vi.mock("../../../../server/utils/errorReporting", () => ({
  reportError: mockReportError,
}));

const { default: ingestHandler } =
  await import("../../../../server/api/ingest/hashnode.post");

const EVENT = {} as H3Event;
const CONFIG_ROW = { id: 7, slug: "danholloran", vendor: "hashnode" };
const VALID_BODY = {
  app: "danholloran",
  posts: [
    {
      slug: "shipping-a-nuxt-dashboard",
      publishedAt: "2026-09-01T12:00:00.000Z",
      views: 120,
    },
    {
      slug: "landscape-photography-in-iceland",
      publishedAt: "2026-08-15T09:30:00.000Z",
      views: 30,
    },
  ],
};

describe("POST /api/ingest/hashnode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("useRuntimeConfig", () => ({
      hashnodeIngestSecret: "ingest-secret",
    }));
    mockReadBody.mockResolvedValue(VALID_BODY);
    mockFindIntegrationConfig.mockResolvedValue(CONFIG_ROW);
    mockPersistProviderResult.mockResolvedValue(undefined);
    mockRecordSyncStatus.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks the ingest secret before reading the body", async () => {
    mockRequireBearerSecret.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(ingestHandler(EVENT)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockRequireBearerSecret).toHaveBeenCalledWith(
      EVENT,
      "ingest-secret",
    );
    expect(mockReadBody).not.toHaveBeenCalled();
    expect(mockPersistProviderResult).not.toHaveBeenCalled();
  });

  it("returns 400 with the validation message for a bad body, writing nothing", async () => {
    mockReadBody.mockResolvedValue({ app: "danholloran", posts: "nope" });

    await expect(ingestHandler(EVENT)).rejects.toMatchObject({
      statusCode: 400,
      message: "posts must be an array.",
    });
    expect(mockFindIntegrationConfig).not.toHaveBeenCalled();
    expect(mockPersistProviderResult).not.toHaveBeenCalled();
  });

  it("returns 404 when the app has no hashnode integration_config row", async () => {
    mockFindIntegrationConfig.mockResolvedValue(null);

    await expect(ingestHandler(EVENT)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockFindIntegrationConfig).toHaveBeenCalledWith(
      FAKE_DB,
      "danholloran",
      "hashnode",
    );
    expect(mockPersistProviderResult).not.toHaveBeenCalled();
  });

  it("persists the posts against the config row, records a successful sync and returns a summary", async () => {
    await expect(ingestHandler(EVENT)).resolves.toEqual({
      app: "danholloran",
      posts: 2,
      views: 150,
    });

    const [db, row, result] = mockPersistProviderResult.mock.calls[0]!;
    expect(db).toBe(FAKE_DB);
    expect(row).toBe(CONFIG_ROW);
    expect(result.syndicationPosts).toHaveLength(2);
    expect(result.metrics).toEqual([
      expect.objectContaining({ metric: "posts", value: 2 }),
      expect.objectContaining({ metric: "views", value: 150 }),
    ]);
    expect(mockRecordSyncStatus).toHaveBeenCalledWith(
      FAKE_DB,
      expect.objectContaining({
        slug: "danholloran",
        vendor: "hashnode",
        ok: true,
        error: null,
      }),
    );
  });

  it("records a failed sync and rethrows when persisting fails", async () => {
    const persistError = new Error("neon down");
    mockPersistProviderResult.mockRejectedValue(persistError);

    await expect(ingestHandler(EVENT)).rejects.toBe(persistError);
    expect(mockRecordSyncStatus).toHaveBeenCalledTimes(1);
    expect(mockRecordSyncStatus).toHaveBeenCalledWith(
      FAKE_DB,
      expect.objectContaining({ ok: false, error: "neon down" }),
    );
  });

  it("still surfaces the persist error when the failure status write also fails", async () => {
    const persistError = new Error("neon down");
    const statusError = new Error("status write failed");
    mockPersistProviderResult.mockRejectedValue(persistError);
    mockRecordSyncStatus.mockRejectedValue(statusError);

    await expect(ingestHandler(EVENT)).rejects.toBe(persistError);
    expect(mockReportError).toHaveBeenCalledWith(
      "ingest: hashnode sync_status write failed",
      statusError,
    );
  });
});
