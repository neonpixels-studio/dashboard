import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clerkProvider,
  fetchClerkMetrics,
} from "../../../../server/integrations/clerk/provider";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type {
  ClerkUserCountRequest,
  ClerkUserCountResponse,
  GetClerkUserCount,
} from "../../../../server/integrations/clerk/types";

// Only clerkProvider.fetch's own two-line wiring (guard + delegate to
// fetchClerkMetrics) needs the real "@clerk/backend" package mocked — every
// other test in this file exercises fetchClerkMetrics directly with an
// injected GetClerkUserCount fake and never touches the network.
const { mockGetCount, mockGetUserList } = vi.hoisted(() => ({
  mockGetCount: vi.fn(),
  mockGetUserList: vi.fn(),
}));
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: { getCount: mockGetCount, getUserList: mockGetUserList },
  }),
}));

afterEach(() => {
  mockGetCount.mockReset();
  mockGetUserList.mockReset();
});

function buildGetClerkUserCount(
  totalUsers: ClerkUserCountResponse,
  newUsers: ClerkUserCountResponse,
): GetClerkUserCount {
  return vi.fn(async (request: ClerkUserCountRequest) =>
    request.createdAtAfter === undefined ? totalUsers : newUsers,
  );
}

describe("clerkProvider", () => {
  it("identifies itself as the clerk vendor", () => {
    expect(clerkProvider.vendor).toBe("clerk");
  });

  it("returns no rows (not zeros, not a throw) when the config has no secret", async () => {
    const config = createTestIntegrationConfig({
      vendor: "clerk",
      secret: null,
    });

    const result = await clerkProvider.fetch(config);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(mockGetCount).not.toHaveBeenCalled();
    expect(mockGetUserList).not.toHaveBeenCalled();
  });

  it("rejects instead of returning partial metrics when the total-count call fails (e.g. a revoked key)", async () => {
    mockGetCount.mockRejectedValue(new Error("Clerk 401: invalid secret key"));
    mockGetUserList.mockResolvedValue({ data: [], totalCount: 37 });
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "clerk",
      secret: "sk_test_revoked",
    });

    await expect(clerkProvider.fetch(config)).rejects.toThrow(
      /invalid secret key/,
    );
  });

  it("rejects instead of returning partial metrics when the new-users call fails (e.g. rate limited)", async () => {
    mockGetCount.mockResolvedValue(842);
    mockGetUserList.mockRejectedValue(new Error("Clerk 429: rate limited"));
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "clerk",
      secret: "sk_test_basin",
    });

    await expect(clerkProvider.fetch(config)).rejects.toThrow(/rate limited/);
  });

  it("end-to-end: builds a real Clerk client from config.secret and returns its computed metrics", async () => {
    mockGetCount.mockResolvedValue(842);
    mockGetUserList.mockResolvedValue({ data: [], totalCount: 37 });
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "clerk",
      secret: "sk_test_e2e",
    });

    const result = await clerkProvider.fetch(config);

    expect(mockGetCount).toHaveBeenCalledWith();
    expect(mockGetUserList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
    const usersMetric = result.metrics.find(
      (metric) => metric.metric === "users",
    );
    const newUsersMetric = result.metrics.find(
      (metric) => metric.metric === "new_users",
    );
    expect(usersMetric?.value).toBe(842);
    expect(newUsersMetric?.value).toBe(37);
  });
});

describe("fetchClerkMetrics", () => {
  it("returns no rows for an unconfigured app, without calling Clerk at all", async () => {
    const config = createTestIntegrationConfig({
      vendor: "clerk",
      secret: null,
    });
    const getClerkUserCount = vi.fn();

    const result = await fetchClerkMetrics(config, getClerkUserCount);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(getClerkUserCount).not.toHaveBeenCalled();
  });

  it("emits users + new_users metrics for a configured app", async () => {
    const totalUsersFixture = await loadFixture<ClerkUserCountResponse>(
      "clerk",
      "total-users",
    );
    const newUsersFixture = await loadFixture<ClerkUserCountResponse>(
      "clerk",
      "new-users-window",
    );
    const getClerkUserCount = buildGetClerkUserCount(
      totalUsersFixture,
      newUsersFixture,
    );
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "clerk",
      secret: "sk_test_basin",
    });

    const result = await fetchClerkMetrics(config, getClerkUserCount);

    expect(result.trafficBreakdown).toEqual([]);
    expect(result.syndicationPosts).toEqual([]);
    expect(result.metrics).toHaveLength(2);

    const usersMetric = result.metrics.find(
      (metric) => metric.metric === "users",
    );
    const newUsersMetric = result.metrics.find(
      (metric) => metric.metric === "new_users",
    );

    expect(usersMetric).toMatchObject({
      vendor: "clerk",
      metric: "users",
      value: 842,
      period: "current",
    });
    expect(newUsersMetric).toMatchObject({
      vendor: "clerk",
      metric: "new_users",
      value: 37,
      period: "30d",
    });
    expect(usersMetric?.capturedAt).toBeInstanceOf(Date);
    // Both metrics from the same fetch share one capture timestamp.
    expect(usersMetric?.capturedAt).toBe(newUsersMetric?.capturedAt);
  });

  it("requests the new-users window scoped to 30 days before capturedAt", async () => {
    const getClerkUserCount = vi.fn(async (request: ClerkUserCountRequest) =>
      request.createdAtAfter === undefined
        ? { totalCount: 1 }
        : { totalCount: 0 },
    );
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "clerk",
      secret: "sk_test_basin",
    });

    const before = Date.now();
    const result = await fetchClerkMetrics(config, getClerkUserCount);
    const after = Date.now();

    const newUsersRequest = (
      getClerkUserCount as ReturnType<typeof vi.fn>
    ).mock.calls.find(
      ([request]: [ClerkUserCountRequest]) =>
        request.createdAtAfter !== undefined,
    )?.[0] as ClerkUserCountRequest;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const capturedAtMs = (result.metrics[0].capturedAt as Date).getTime();

    expect(newUsersRequest.createdAtAfter).toBe(capturedAtMs - thirtyDaysMs);
    expect(capturedAtMs).toBeGreaterThanOrEqual(before);
    expect(capturedAtMs).toBeLessThanOrEqual(after);
  });

  it("returns zero-value metrics (not empty) when Clerk reports zero users, distinguishing a real zero from unconfigured", async () => {
    const zeroUsersFixture = await loadFixture<ClerkUserCountResponse>(
      "clerk",
      "zero-users",
    );
    const getClerkUserCount = buildGetClerkUserCount(
      zeroUsersFixture,
      zeroUsersFixture,
    );
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "clerk",
      secret: "sk_test_basin",
    });

    const result = await fetchClerkMetrics(config, getClerkUserCount);

    expect(result.metrics).toHaveLength(2);
    expect(result.metrics.every((metric) => metric.value === 0)).toBe(true);
  });

  it("propagates an invalid (negative) count as a thrown error instead of reporting it", async () => {
    const getClerkUserCount = vi.fn(async () => ({ totalCount: -5 }));
    const config = createTestIntegrationConfig({
      slug: "basin",
      vendor: "clerk",
      secret: "sk_test_basin",
    });

    await expect(fetchClerkMetrics(config, getClerkUserCount)).rejects.toThrow(
      /must be a non-negative integer/,
    );
  });
});
