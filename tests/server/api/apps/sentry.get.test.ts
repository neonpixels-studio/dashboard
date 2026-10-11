import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { H3Event } from "h3";

const mockRequireUser = vi.fn();
vi.mock("../../../../server/utils/auth", () => ({
  requireUser: mockRequireUser,
}));
vi.mock("../../../../server/db", () => ({ useDb: () => ({}) }));

const mockFetchIntegrationConfigs = vi.fn();
vi.mock("../../../../server/utils/dashboardQueries", () => ({
  fetchIntegrationConfigs: mockFetchIntegrationConfigs,
}));

const mockResolveIntegrationConfig = vi.fn();
vi.mock("../../../../server/integrations/config", () => ({
  resolveIntegrationConfig: mockResolveIntegrationConfig,
}));

const mockFetchSentryPanelData = vi.fn();
vi.mock("../../../../server/integrations/sentry/panelData", () => ({
  fetchSentryPanelData: mockFetchSentryPanelData,
}));

const mockCreateFetcher = vi.fn();
vi.mock("../../../../server/integrations/sentry/sentryClient", () => ({
  createSentryTopIssuesFetcher: mockCreateFetcher,
}));

const { default: sentryHandler } =
  await import("../../../../server/api/apps/[slug]/sentry.get");

function makeEvent(slug?: string): H3Event {
  return { context: { params: slug ? { slug } : {} } } as unknown as H3Event;
}

const SENTRY_ROW = { vendor: "sentry", enabled: true, slug: "basin" };
const PANEL = { issues: [], trend: [], trendTotalEvents: 0, issuesUrl: "u" };

describe("GET /api/apps/[slug]/sentry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NUXT_SENTRY_ORG", "acme");
    mockFetchIntegrationConfigs.mockResolvedValue([SENTRY_ROW]);
    mockResolveIntegrationConfig.mockReturnValue({
      slug: "basin",
      vendor: "sentry",
      externalId: "basin-prod",
      secret: "token",
    });
    mockCreateFetcher.mockReturnValue("fetcher");
    mockFetchSentryPanelData.mockResolvedValue(PANEL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires auth before touching the database", async () => {
    mockRequireUser.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });

    await expect(sentryHandler(makeEvent("basin"))).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mockFetchIntegrationConfigs).not.toHaveBeenCalled();
  });

  it("404s for an unknown property", async () => {
    await expect(sentryHandler(makeEvent("nope"))).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockFetchIntegrationConfigs).not.toHaveBeenCalled();
  });

  it("404s when the app has no enabled sentry integration", async () => {
    mockFetchIntegrationConfigs.mockResolvedValue([
      { ...SENTRY_ROW, enabled: false },
      { ...SENTRY_ROW, vendor: "stripe" },
    ]);

    await expect(sentryHandler(makeEvent("basin"))).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockFetchSentryPanelData).not.toHaveBeenCalled();
  });

  it("404s when the org slug is not configured", async () => {
    vi.stubEnv("NUXT_SENTRY_ORG", "");

    await expect(sentryHandler(makeEvent("basin"))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("404s when the integration has no auth token", async () => {
    mockResolveIntegrationConfig.mockReturnValue({
      slug: "basin",
      vendor: "sentry",
      externalId: null,
      secret: null,
    });

    await expect(sentryHandler(makeEvent("basin"))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("404s when no Sentry project is configured for the app", async () => {
    mockFetchSentryPanelData.mockResolvedValue(null);

    await expect(sentryHandler(makeEvent("basin"))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns the live panel data using the resolved token and org", async () => {
    const result = await sentryHandler(makeEvent("basin"));

    expect(result).toBe(PANEL);
    expect(mockCreateFetcher).toHaveBeenCalledWith("token", "acme");
    expect(mockFetchSentryPanelData).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "basin-prod" }),
      "acme",
      "fetcher",
    );
  });
});
