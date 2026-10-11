import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchNetlifyDeploys,
  netlifyProvider,
} from "../../../../server/integrations/netlify/provider";
import { createAbortAwareFetch } from "../../../../server/integrations/testing/abortAwareFetch";
import { createExhaustedDeadline } from "../../../../server/integrations/testing/deadlineFixtures";
import { createTestIntegrationConfig } from "../../../../server/integrations/testing/testConfig";
import { PROVIDERS } from "../../../../server/integrations/providers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchNetlifyDeploys", () => {
  it("looks up the project name derived from the property's domain and returns its deploy", async () => {
    const lookup = vi.fn(async () => ({
      id: "d1",
      state: "error",
      finishedAt: new Date("2026-10-10T12:00:00Z"),
    }));

    const result = await fetchNetlifyDeploys(
      createTestIntegrationConfig({ slug: "basin", vendor: "netlify" }),
      lookup,
    );

    expect(lookup).toHaveBeenCalledWith("basin-fm");
    expect(result.deploys).toEqual([
      {
        deployId: "d1",
        state: "error",
        finishedAt: new Date("2026-10-10T12:00:00Z"),
      },
    ]);
    expect(result.metrics).toEqual([]);
  });

  it("returns no rows when the project has no production deploy", async () => {
    const result = await fetchNetlifyDeploys(
      createTestIntegrationConfig({ slug: "basin", vendor: "netlify" }),
      async () => null,
    );

    expect(result.deploys).toBeUndefined();
    expect(result.skipped).toBeUndefined();
  });

  it("throws for a slug that isn't a configured property", async () => {
    await expect(
      fetchNetlifyDeploys(
        createTestIntegrationConfig({ slug: "nope", vendor: "netlify" }),
        async () => null,
      ),
    ).rejects.toThrow(/no property configured for "nope"/);
  });
});

describe("netlifyProvider", () => {
  it("identifies itself as the netlify vendor and is registered", () => {
    expect(netlifyProvider.vendor).toBe("netlify");
    expect(PROVIDERS).toContain(netlifyProvider);
  });

  it("skips cleanly, without calling the network, when no token is configured", async () => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", "");
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);

    const result = await netlifyProvider.fetch(
      createTestIntegrationConfig({ slug: "basin", vendor: "netlify" }),
    );

    expect(result.skipped).toBe(true);
    expect(result.deploys).toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("end to end: reads NUXT_NETLIFY_TOKEN and maps the API response with a fake fetch", async () => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", "nfp_env");
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: "d9",
              state: "ready",
              published_at: "2026-10-10T12:00:00Z",
            },
          ]),
        ),
    );
    vi.stubGlobal("fetch", fetchStub);

    const result = await netlifyProvider.fetch(
      createTestIntegrationConfig({ slug: "markpost", vendor: "netlify" }),
    );

    const [url, init] = fetchStub.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.pathname).toBe("/api/v1/sites/markpost-io.netlify.app/deploys");
    expect(init.headers).toEqual({ Authorization: "Bearer nfp_env" });
    expect(result.deploys).toEqual([
      {
        deployId: "d9",
        state: "ready",
        finishedAt: new Date("2026-10-10T12:00:00Z"),
      },
    ]);
  });

  it("prefers a resolved config.secret over the env var", async () => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", "nfp_env");
    const fetchStub = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchStub);

    await netlifyProvider.fetch(
      createTestIntegrationConfig({
        slug: "basin",
        vendor: "netlify",
        secret: "nfp_row",
      }),
    );

    const [, init] = fetchStub.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).toEqual({ Authorization: "Bearer nfp_row" });
  });

  it("threads the shared deadline into the client", async () => {
    vi.stubEnv("NUXT_NETLIFY_TOKEN", "nfp_env");
    vi.stubGlobal(
      "fetch",
      createAbortAwareFetch(() => new Response("[]")),
    );

    await expect(
      netlifyProvider.fetch(
        createTestIntegrationConfig({ slug: "basin", vendor: "netlify" }),
        createExhaustedDeadline(),
      ),
    ).rejects.toThrow(/was aborted/);
  });
});
