import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSentryMetrics,
  sentryProvider,
} from "../../../../server/integrations/sentry/provider";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { loadFixture } from "../../../../server/integrations/testing/loadFixture";
import type { SentryIssuePage } from "../../../../server/integrations/sentry/types";

afterEach(() => {
  vi.unstubAllEnvs();
  // Runs even if an assertion above it throws mid-test — stubbing this in
  // the test body and only unstubbing at the bottom would otherwise leak the
  // stub into later tests in this file whenever an earlier assertion fails.
  vi.unstubAllGlobals();
});

function buildSearchSentryIssues(
  responsesByQuery: Record<string, SentryIssuePage>,
) {
  return vi.fn(async ({ query }: { query: string }) => {
    const page = responsesByQuery[query];
    if (!page) {
      throw new Error(`No fixture page registered for query "${query}"`);
    }
    return page;
  });
}

describe("sentryProvider", () => {
  it("identifies itself as the sentry vendor", () => {
    expect(sentryProvider.vendor).toBe("sentry");
  });

  it("throws when the config has no auth token configured", async () => {
    vi.stubEnv("NUXT_SENTRY_ORG", "acme");
    const config = createTestIntegrationConfig({
      vendor: "sentry",
      externalId: "markpost",
      secret: null,
    });

    await expect(sentryProvider.fetch(config)).rejects.toThrow(
      /no auth token configured/,
    );
  });

  it("throws when NUXT_SENTRY_ORG is not configured", async () => {
    vi.stubEnv("NUXT_SENTRY_ORG", "");
    const config = createTestIntegrationConfig({
      vendor: "sentry",
      externalId: "markpost",
      secret: "token_abc",
    });

    await expect(sentryProvider.fetch(config)).rejects.toThrow(
      /NUXT_SENTRY_ORG/,
    );
  });

  it("end-to-end: builds a real searcher from config.secret + NUXT_SENTRY_ORG, hits the expected URL, and returns per-query normalized metrics", async () => {
    vi.stubEnv("NUXT_SENTRY_ORG", "acme");
    const threeOpen = await loadFixture<SentryIssuePage>(
      "sentry",
      "three-open-issues",
    );
    const oneFatal = await loadFixture<SentryIssuePage>(
      "sentry",
      "one-fatal-issue",
    );
    // Real Sentry returns a different result set per query — this stub keys
    // off the request's own `query` param so open_issues and fatal_issues
    // can't both pass by coincidentally matching the same fixture.
    const fetchStub = vi.fn(async (url: URL) => {
      const query = url.searchParams.get("query");
      const issues =
        query === "is:unresolved level:fatal"
          ? oneFatal.issues
          : threeOpen.issues;
      return {
        ok: true,
        status: 200,
        json: async () => issues,
        // A real Sentry response always carries a Link header (see
        // mapping.ts's parseSentryNextCursor) — this fixture is a single,
        // final page, so results="false".
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "link"
              ? '<url>; rel="next"; results="false"; cursor="0:0:1"'
              : null,
        },
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchStub);
    const config = createTestIntegrationConfig({
      slug: "markpost",
      vendor: "sentry",
      externalId: "markpost",
      secret: "token_abc",
    });

    const result = await sentryProvider.fetch(config);

    const [requestedUrl] = fetchStub.mock.calls[0] ?? [];
    expect((requestedUrl as URL).pathname).toBe(
      "/api/0/projects/acme/markpost/issues/",
    );

    const openIssuesMetric = result.metrics.find(
      (metric) => metric.metric === "open_issues",
    );
    const fatalIssuesMetric = result.metrics.find(
      (metric) => metric.metric === "fatal_issues",
    );
    expect(openIssuesMetric?.value).toBe(threeOpen.issues.length);
    expect(fatalIssuesMetric?.value).toBe(oneFatal.issues.length);
  });
});

describe("fetchSentryMetrics", () => {
  it("returns no rows (not zeros) for an unconfigured app, without calling Sentry at all", async () => {
    // Pinned to a real app slug + an explicitly-empty env fallback, rather
    // than relying on the default test slug's env var happening to be unset
    // in whatever shell/.env this runs under.
    vi.stubEnv("NUXT_SENTRY_PROJECT_MARKPOST", "");
    const config = createTestIntegrationConfig({
      slug: "markpost",
      vendor: "sentry",
      externalId: null,
      secret: "token_unused",
    });
    const searchSentryIssues = vi.fn();

    const result = await fetchSentryMetrics(config, searchSentryIssues);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
    });
    expect(searchSentryIssues).not.toHaveBeenCalled();
  });

  it("returns no rows for a blank project-slug string, same as null", async () => {
    vi.stubEnv("NUXT_SENTRY_PROJECT_MARKPOST", "");
    const config = createTestIntegrationConfig({
      slug: "markpost",
      vendor: "sentry",
      externalId: "   ",
      secret: "token_unused",
    });
    const searchSentryIssues = vi.fn();

    const result = await fetchSentryMetrics(config, searchSentryIssues);

    expect(result.metrics).toEqual([]);
    expect(searchSentryIssues).not.toHaveBeenCalled();
  });

  it("falls back to the shared NUXT_SENTRY_PROJECT_<SLUG> env var when integration_config.external_id is unset", async () => {
    vi.stubEnv("NUXT_SENTRY_PROJECT_MARKPOST", "markpost-prod");
    const noIssues = await loadFixture<SentryIssuePage>("sentry", "no-issues");
    const searchSentryIssues = buildSearchSentryIssues({
      "is:unresolved": noIssues,
      "is:unresolved level:fatal": noIssues,
    });
    const config = createTestIntegrationConfig({
      slug: "markpost",
      vendor: "sentry",
      externalId: null,
      secret: "token_markpost",
    });

    await fetchSentryMetrics(config, searchSentryIssues);

    expect(searchSentryIssues).toHaveBeenCalledWith(
      expect.objectContaining({ projectSlug: "markpost-prod" }),
    );
  });

  it("prefers integration_config.external_id over the env var when both are set", async () => {
    vi.stubEnv("NUXT_SENTRY_PROJECT_MARKPOST", "wrong-project");
    const noIssues = await loadFixture<SentryIssuePage>("sentry", "no-issues");
    const searchSentryIssues = buildSearchSentryIssues({
      "is:unresolved": noIssues,
      "is:unresolved level:fatal": noIssues,
    });
    const config = createTestIntegrationConfig({
      slug: "markpost",
      vendor: "sentry",
      externalId: "markpost-from-row",
      secret: "token_markpost",
    });

    await fetchSentryMetrics(config, searchSentryIssues);

    expect(searchSentryIssues).toHaveBeenCalledWith(
      expect.objectContaining({ projectSlug: "markpost-from-row" }),
    );
    expect(searchSentryIssues).not.toHaveBeenCalledWith(
      expect.objectContaining({ projectSlug: "wrong-project" }),
    );
  });

  it("emits open_issues + fatal_issues metrics for a configured app", async () => {
    const threeOpen = await loadFixture<SentryIssuePage>(
      "sentry",
      "three-open-issues",
    );
    const oneFatal = await loadFixture<SentryIssuePage>(
      "sentry",
      "one-fatal-issue",
    );
    const searchSentryIssues = buildSearchSentryIssues({
      "is:unresolved": threeOpen,
      "is:unresolved level:fatal": oneFatal,
    });
    const config = createTestIntegrationConfig({
      slug: "markpost",
      vendor: "sentry",
      externalId: "markpost-prod",
      secret: "token_markpost",
    });

    const result = await fetchSentryMetrics(config, searchSentryIssues);

    expect(result.trafficBreakdown).toEqual([]);
    expect(result.syndicationPosts).toEqual([]);
    expect(result.metrics).toHaveLength(2);

    const openIssuesMetric = result.metrics.find(
      (metric) => metric.metric === "open_issues",
    );
    const fatalIssuesMetric = result.metrics.find(
      (metric) => metric.metric === "fatal_issues",
    );

    expect(openIssuesMetric).toMatchObject({
      vendor: "sentry",
      metric: "open_issues",
      value: 3,
      period: "current",
    });
    expect(fatalIssuesMetric).toMatchObject({
      vendor: "sentry",
      metric: "fatal_issues",
      value: 1,
      period: "current",
    });
    expect(openIssuesMetric?.capturedAt).toBeInstanceOf(Date);
    // Both metrics from the same fetch share one capture timestamp.
    expect(openIssuesMetric?.capturedAt).toBe(fatalIssuesMetric?.capturedAt);
  });

  it("queries open issues and fatal issues concurrently, not one after the other", async () => {
    const startedQueries: string[] = [];
    const pendingResolvers: Record<string, (page: SentryIssuePage) => void> =
      {};
    const searchSentryIssues = vi.fn(({ query }: { query: string }) => {
      startedQueries.push(query);
      return new Promise<SentryIssuePage>((resolve) => {
        pendingResolvers[query] = resolve;
      });
    });
    const config = createTestIntegrationConfig({
      slug: "markpost",
      vendor: "sentry",
      externalId: "markpost-prod",
      secret: "token_markpost",
    });

    const resultPromise = fetchSentryMetrics(config, searchSentryIssues);
    await Promise.resolve();
    await Promise.resolve();

    expect(startedQueries.sort()).toEqual(
      ["is:unresolved", "is:unresolved level:fatal"].sort(),
    );

    // Both resolvers are set synchronously inside the searchSentryIssues
    // stub above, in the same call that pushes onto startedQueries — the
    // assertion just above already proves both queries started, so both
    // keys are guaranteed to be present here too.
    const resolveOpenIssues = pendingResolvers["is:unresolved"];
    const resolveFatalIssues = pendingResolvers["is:unresolved level:fatal"];
    expect(resolveOpenIssues).toBeDefined();
    expect(resolveFatalIssues).toBeDefined();
    resolveOpenIssues?.({ issues: [], hasMore: false, nextCursor: null });
    resolveFatalIssues?.({ issues: [], hasMore: false, nextCursor: null });
    await resultPromise;
  });
});
