import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const mockRequireUser = vi.fn();
vi.mock("../../../../server/utils/auth", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("../../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchLatestMetricSnapshots = vi.fn();
const mockFetchMetricSnapshotSeries = vi.fn();
const mockFetchLatestTrafficBreakdowns = vi.fn();
const mockFetchSyncStatuses = vi.fn();
const mockFetchIntegrationConfigs = vi.fn();
const mockFetchSyndicationPosts = vi.fn();
const mockFetchGithubRepoStatuses = vi.fn();
const mockFetchGithubItems = vi.fn();
vi.mock("../../../../server/utils/dashboardQueries", () => ({
  fetchLatestMetricSnapshots: mockFetchLatestMetricSnapshots,
  fetchMetricSnapshotSeries: mockFetchMetricSnapshotSeries,
  fetchLatestTrafficBreakdowns: mockFetchLatestTrafficBreakdowns,
  fetchSyncStatuses: mockFetchSyncStatuses,
  fetchIntegrationConfigs: mockFetchIntegrationConfigs,
  fetchSyndicationPosts: mockFetchSyndicationPosts,
  fetchGithubRepoStatuses: mockFetchGithubRepoStatuses,
  fetchGithubItems: mockFetchGithubItems,
}));

const { default: appDetailHandler } =
  await import("../../../../server/api/apps/[slug].get");

function makeEvent(slug?: string): H3Event {
  return { context: { params: slug ? { slug } : {} } } as unknown as H3Event;
}

describe("GET /api/apps/[slug]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchLatestMetricSnapshots.mockResolvedValue([]);
    mockFetchMetricSnapshotSeries.mockResolvedValue([]);
    mockFetchLatestTrafficBreakdowns.mockResolvedValue([]);
    mockFetchSyncStatuses.mockResolvedValue([]);
    mockFetchIntegrationConfigs.mockResolvedValue([]);
    mockFetchSyndicationPosts.mockResolvedValue([]);
    mockFetchGithubRepoStatuses.mockResolvedValue([]);
    mockFetchGithubItems.mockResolvedValue([]);
    vi.stubEnv("NUXT_GITHUB_TOKEN", "");
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(appDetailHandler(makeEvent("basin"))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchLatestMetricSnapshots).not.toHaveBeenCalled();
  });

  it("404s for a slug that isn't in app/config/apps.ts", async () => {
    await expect(
      appDetailHandler(makeEvent("not-a-real-app")),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockFetchLatestMetricSnapshots).not.toHaveBeenCalled();
  });

  it("404s when no slug param is present", async () => {
    await expect(appDetailHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns an empty/null-metric shape when the db has no rows for the app yet", async () => {
    const result = await appDetailHandler(makeEvent("basin"));

    expect(result).toEqual({
      slug: "basin",
      status: { label: "NOT SYNCED", tone: "muted" },
      metrics: [],
      series: [],
      trafficBreakdown: [],
      syndication: [],
      alerts: [],
      sources: [],
      integrations: [],
      lastSyncedAt: null,
      clerkUsersUrl: null,
      ga4PropertyId: null,
      github: {
        configured: false,
        repos: [
          {
            repo: "basin",
            synced: false,
            openIssues: null,
            openPrs: null,
            ciState: null,
            ciUrl: "https://github.com/neonpixels-studio/basin/actions",
            repoUrl: "https://github.com/neonpixels-studio/basin",
          },
        ],
        issuesUrl: "https://github.com/neonpixels-studio/basin/issues",
        pullsUrl: "https://github.com/neonpixels-studio/basin/pulls",
        items: [],
      },
    });
  });

  describe("github", () => {
    it("marks the section configured once NUXT_GITHUB_TOKEN is set", async () => {
      vi.stubEnv("NUXT_GITHUB_TOKEN", "github_pat_x");
      const result = await appDetailHandler(makeEvent("basin"));
      expect(result.github.configured).toBe(true);
    });

    it("covers markpost and markpost-cli on the markpost page, summarising each repo", async () => {
      vi.stubEnv("NUXT_GITHUB_TOKEN", "github_pat_x");
      mockFetchGithubRepoStatuses.mockResolvedValue([
        {
          slug: "markpost",
          repo: "markpost-cli",
          openIssues: 2,
          openPrs: 1,
          ciState: "failing",
          ciSha: "abc123",
          commitAt: new Date("2026-10-09T12:00:00Z"),
          syncedAt: new Date("2026-10-10T00:00:00Z"),
        },
      ]);
      mockFetchGithubItems.mockResolvedValue([
        {
          slug: "markpost",
          repo: "markpost-cli",
          number: 7,
          kind: "pr",
          title: "Fix flags",
          url: "https://github.com/neonpixels-studio/markpost-cli/pull/7",
          labels: ["bug"],
          itemUpdatedAt: new Date("2026-10-09T12:00:00Z"),
        },
      ]);

      const { github } = await appDetailHandler(makeEvent("markpost"));

      expect(github.repos.map((repo) => repo.repo)).toEqual([
        "markpost",
        "markpost-cli",
      ]);
      expect(github.repos[0]).toMatchObject({
        synced: false,
        openIssues: null,
      });
      expect(github.repos[1]).toMatchObject({
        synced: true,
        openIssues: 2,
        openPrs: 1,
        ciState: "failing",
        ciUrl:
          "https://github.com/neonpixels-studio/markpost-cli/commit/abc123/checks",
      });
      expect(github.items).toEqual([
        {
          repo: "markpost-cli",
          number: 7,
          kind: "pr",
          title: "Fix flags",
          url: "https://github.com/neonpixels-studio/markpost-cli/pull/7",
          labels: ["bug"],
          updatedAt: "2026-10-09T12:00:00.000Z",
        },
      ]);
    });
  });

  it("links to the Clerk dashboard users page when the app has an enabled clerk integration", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "clerk",
        enabled: true,
        externalId: "app_2abc/ins_9xyz",
        secretRef: null,
        encryptedSecret: null,
      },
    ]);

    const result = await appDetailHandler(makeEvent("basin"));

    expect(result.clerkUsersUrl).toBe(
      "https://dashboard.clerk.com/apps/app_2abc/instances/ins_9xyz/users",
    );
  });

  it("exposes the enabled GA4 property id for the app", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "ga4",
        enabled: true,
        externalId: "412345678",
        secretRef: "SHOULD_NOT_LEAK",
        encryptedSecret: null,
      },
    ]);

    const result = await appDetailHandler(makeEvent("basin"));

    expect(result.ga4PropertyId).toBe("412345678");
    expect(JSON.stringify(result)).not.toContain("SHOULD_NOT_LEAK");
  });

  it("scopes every fetch to the requested slug", async () => {
    await appDetailHandler(makeEvent("basin"));

    expect(mockFetchLatestMetricSnapshots).toHaveBeenCalledWith({}, ["basin"]);
    expect(mockFetchMetricSnapshotSeries).toHaveBeenCalledWith({}, ["basin"]);
    expect(mockFetchLatestTrafficBreakdowns).toHaveBeenCalledWith({}, [
      "basin",
    ]);
    expect(mockFetchSyncStatuses).toHaveBeenCalledWith({}, ["basin"]);
    expect(mockFetchIntegrationConfigs).toHaveBeenCalledWith({}, ["basin"]);
    expect(mockFetchSyndicationPosts).toHaveBeenCalledWith({}, "basin");
  });

  it("surfaces a failing vendor as both an alert and a source", async () => {
    mockFetchSyncStatuses.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "sentry",
        lastRunAt: new Date("2026-09-19T00:00:00Z"),
        lastSuccessAt: null,
        ok: false,
        error: "rate limited",
      },
    ]);

    const result = await appDetailHandler(makeEvent("basin"));

    expect(result.alerts).toEqual([
      {
        slug: "basin",
        vendor: "sentry",
        message: "rate limited",
        occurredAt: new Date("2026-09-19T00:00:00Z").toISOString(),
      },
    ]);
    expect(result.sources).toEqual([
      {
        vendor: "sentry",
        environment: null,
        ok: false,
        lastRunAt: new Date("2026-09-19T00:00:00Z").toISOString(),
        lastSuccessAt: null,
        error: "rate limited",
      },
    ]);
    expect(result.lastSyncedAt).toBeNull();
    expect(result.status).toEqual({ label: "1 ISSUE", tone: "danger" });
  });

  it("reports LIVE when every active vendor's last sync succeeded", async () => {
    mockFetchSyncStatuses.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "sentry",
        lastRunAt: new Date("2026-09-19T00:00:00Z"),
        lastSuccessAt: new Date("2026-09-19T00:00:00Z"),
        ok: true,
        error: null,
      },
    ]);

    const result = await appDetailHandler(makeEvent("basin"));

    expect(result.status).toEqual({ label: "LIVE", tone: "ok" });
  });

  it("ignores a failing disabled vendor when another vendor is healthy", async () => {
    mockFetchSyncStatuses.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "sentry",
        lastRunAt: new Date("2026-09-19T00:00:00Z"),
        lastSuccessAt: null,
        ok: false,
        error: "rate limited",
      },
      {
        id: 2,
        slug: "basin",
        vendor: "stripe",
        lastRunAt: new Date("2026-09-19T00:00:00Z"),
        lastSuccessAt: new Date("2026-09-19T00:00:00Z"),
        ok: true,
        error: null,
      },
    ]);
    mockFetchIntegrationConfigs.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "sentry",
        enabled: false,
        externalId: null,
        secretRef: null,
        encryptedSecret: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const result = await appDetailHandler(makeEvent("basin"));

    expect(result.status).toEqual({ label: "LIVE", tone: "ok" });
  });

  it("suppresses an alert for a vendor that's been explicitly disabled", async () => {
    mockFetchSyncStatuses.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "sentry",
        lastRunAt: new Date("2026-09-19T00:00:00Z"),
        lastSuccessAt: null,
        ok: false,
        error: "rate limited",
      },
    ]);
    mockFetchIntegrationConfigs.mockResolvedValue([
      {
        id: 1,
        slug: "basin",
        vendor: "sentry",
        enabled: false,
        externalId: null,
        secretRef: null,
        encryptedSecret: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const result = await appDetailHandler(makeEvent("basin"));

    expect(result.alerts).toEqual([]);
    expect(result.status).toEqual({ label: "NOT SYNCED", tone: "muted" });
    // sources still reflect sync history regardless of enabled/disabled.
    expect(result.sources).toHaveLength(1);
    // the disabled-but-configured vendor still shows up as an integration.
    expect(result.integrations.map((entry) => entry.vendor)).toEqual([
      "sentry",
    ]);
  });
});
