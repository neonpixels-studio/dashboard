import { describe, expect, it, vi } from "vitest";
import { createExhaustedDeadline } from "../../../../server/integrations/testing/deadlineFixtures";
import { createNeonClient } from "../../../../server/integrations/neon/neonClient";

const API_KEY = "napi_secret_key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PROJECT_BODY = {
  project: {
    compute_time_seconds: 3_600,
    active_time_seconds: 7_200,
    synthetic_storage_size: 0,
    data_transfer_bytes: 10,
    written_data_bytes: 20,
    consumption_period_start: "2026-10-01T00:00:00Z",
    consumption_period_end: "2026-11-01T00:00:00Z",
  },
};

// A full page (the client asks for 100), so a cursor on it means "more".
const FULL_PAGE = Array.from({ length: 100 }, (_, index) => ({
  name: `branch-${index}`,
}));

describe("createNeonClient", () => {
  it("requests the project with a bearer token and maps the usage", async () => {
    const fetchStub = vi.fn(async () => jsonResponse(PROJECT_BODY));
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
    );

    const usage = await client.getProjectUsage("proj-1");

    const [url, init] = fetchStub.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe(
      "https://console.neon.tech/api/v2/projects/proj-1",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`,
    );
    expect(usage.computeTimeSeconds).toBe(3_600);
  });

  it("encodes a project id so it cannot change the request path", async () => {
    const fetchStub = vi.fn(async () => jsonResponse(PROJECT_BODY));
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
    );

    await client.getProjectUsage("a/b?c");

    const [url] = fetchStub.mock.calls[0] as unknown as [URL];
    expect(url.pathname).toBe("/api/v2/projects/a%2Fb%3Fc");
    expect(url.search).toBe("");
  });

  it("throws with the status but never the API key on a failed request", async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ message: "no" }, 401));
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
    );

    const failure = await client
      .getProjectUsage("proj-1")
      .catch((e: Error) => e);

    expect((failure as Error).message).toMatch(/status 401/);
    expect((failure as Error).message).not.toContain(API_KEY);
  });

  it("throws on a non-JSON body", async () => {
    const fetchStub = vi.fn(
      async () => new Response("<html>", { status: 200 }),
    );
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
    );

    await expect(client.getProjectUsage("proj-1")).rejects.toThrow(/non-JSON/);
  });

  it("follows the branch pagination cursor until the last page", async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          branches: FULL_PAGE,
          pagination: { next: "c2" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ branches: [{ name: "e2e" }] }));
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
    );

    const branches = await client.listBranches("proj-1");

    expect(branches).toHaveLength(101);
    expect(branches.at(-1)!.name).toBe("e2e");
    const secondUrl = fetchStub.mock.calls[1]![0] as URL;
    expect(secondUrl.searchParams.get("cursor")).toBe("c2");
  });

  it("stops on a short page even if Neon still sends a cursor", async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({
        branches: [{ name: "production" }],
        pagination: { next: "stale" },
      }),
    );
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
    );

    const branches = await client.listBranches("proj-1");

    expect(branches).toHaveLength(1);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("refuses to follow a cursor forever", async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({
        branches: FULL_PAGE,
        pagination: { next: "again" },
      }),
    );
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
    );

    await expect(client.listBranches("proj-1")).rejects.toThrow(/exceeded/);
  });

  it("aborts when the shared run budget is exhausted", async () => {
    const fetchStub = vi.fn(async (_url: URL, init: RequestInit) => {
      init.signal?.throwIfAborted();
      return jsonResponse(PROJECT_BODY);
    });
    const client = createNeonClient(
      API_KEY,
      fetchStub as unknown as typeof fetch,
      createExhaustedDeadline(),
    );

    await expect(client.getProjectUsage("proj-1")).rejects.toThrow();
  });
});
