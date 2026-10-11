import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubClient } from "../../../../server/integrations/github/githubClient";
import {
  fetchGithubSnapshots,
  githubProvider,
} from "../../../../server/integrations/github/provider";
import {
  fakeGithubFetch,
  mainCiRoutes,
  rawIssue,
  rawPull,
} from "./fakeGithubFetch";

const SYNCED_AT = new Date("2026-10-10T00:00:00Z");
const CONFIG = {
  slug: "basin",
  vendor: "github",
  externalId: null,
  secret: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function clientFor(routes: Parameters<typeof fakeGithubFetch>[0]) {
  const { fetchImpl, requests } = fakeGithubFetch(routes);
  return { client: createGithubClient({ token: "t", fetchImpl }), requests };
}

describe("fetchGithubSnapshots", () => {
  it("fetches only the property's own repo by default", async () => {
    const { client, requests } = clientFor({
      "/repos/neonpixels-studio/basin/issues": [rawIssue(1)],
      ...mainCiRoutes("basin"),
    });

    const snapshots = await fetchGithubSnapshots("basin", client, SYNCED_AT);

    expect(snapshots.map((snapshot) => snapshot.repo)).toEqual(["basin"]);
    expect(
      requests.every((request) => request.url.pathname.includes("/basin")),
    ).toBe(true);
  });

  it("rolls markpost-cli into markpost, one snapshot per repo", async () => {
    const { client } = clientFor({
      "/repos/neonpixels-studio/markpost/issues": [rawIssue(1), rawPull(2)],
      "/repos/neonpixels-studio/markpost-cli/issues": [
        rawIssue(1),
        rawIssue(2),
        rawIssue(3),
      ],
      ...mainCiRoutes("markpost"),
      ...mainCiRoutes("markpost-cli", {
        sha: "cli-sha",
        runs: [{ status: "completed", conclusion: "failure", event: "push" }],
      }),
    });

    const snapshots = await fetchGithubSnapshots("markpost", client, SYNCED_AT);

    expect(
      snapshots.map((snapshot) => [
        snapshot.repo,
        snapshot.openIssues,
        snapshot.openPrs,
        snapshot.ci.state,
      ]),
    ).toEqual([
      ["markpost", 1, 1, "passing"],
      ["markpost-cli", 3, 0, "failing"],
    ]);
  });

  it("fails the whole sync when one repo fails, so no repo is half-replaced", async () => {
    const { client } = clientFor({
      "/repos/neonpixels-studio/markpost/issues": [],
      ...mainCiRoutes("markpost"),
      "/repos/neonpixels-studio/markpost-cli/issues": () =>
        new Response("", { status: 404 }),
      ...mainCiRoutes("markpost-cli"),
    });

    await expect(
      fetchGithubSnapshots("markpost", client, SYNCED_AT),
    ).rejects.toThrow(/status 404/);
  });
});

describe("githubProvider.fetch", () => {
  it("is registered for the github vendor", () => {
    expect(githubProvider.vendor).toBe("github");
  });

  it("skips cleanly, without throwing, when no token is configured", async () => {
    vi.stubEnv("NUXT_GITHUB_TOKEN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await githubProvider.fetch(CONFIG);

    expect(result).toEqual({
      metrics: [],
      trafficBreakdown: [],
      syndicationPosts: [],
      skipped: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("syncs through the real client using the env token", async () => {
    vi.stubEnv("NUXT_GITHUB_TOKEN", "github_pat_live");
    const { fetchImpl, requests } = fakeGithubFetch({
      "/repos/neonpixels-studio/basin/issues": [rawIssue(1)],
      ...mainCiRoutes("basin"),
    });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await githubProvider.fetch(CONFIG);

    expect(result.skipped).toBeUndefined();
    expect(result.github).toHaveLength(1);
    expect(result.github![0]).toMatchObject({ repo: "basin", openIssues: 1 });
    expect(requests[0]!.init?.headers).toMatchObject({
      Authorization: "Bearer github_pat_live",
    });
  });
});

describe("provider registry", () => {
  it("registers the github provider with the orchestrator", async () => {
    const { integrationRegistry } =
      await import("../../../../server/integrations");
    expect(integrationRegistry.get("github")).toBe(githubProvider);
  });
});
