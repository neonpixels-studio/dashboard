import { describe, expect, it, vi } from "vitest";
import { createNetlifyDeployFetcher } from "../../../../server/integrations/netlify/netlifyClient";
import { createAbortAwareFetch } from "../../../../server/integrations/testing/abortAwareFetch";
import { createExhaustedDeadline } from "../../../../server/integrations/testing/deadlineFixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createNetlifyDeployFetcher", () => {
  it("requests the latest production deploy for the project's netlify.app domain with a bearer token", async () => {
    const fetchStub = vi.fn(async () => jsonResponse([]));

    await createNetlifyDeployFetcher("nfp_secret", fetchStub)("basin-fm");

    const [url, init] = fetchStub.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.origin + url.pathname).toBe(
      "https://api.netlify.com/api/v1/sites/basin-fm.netlify.app/deploys",
    );
    expect(url.searchParams.get("production")).toBe("true");
    expect(url.searchParams.get("per_page")).toBe("1");
    expect(init.headers).toEqual({ Authorization: "Bearer nfp_secret" });
  });

  it("returns the mapped latest deploy", async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse([
        {
          id: "d1",
          state: "ready",
          published_at: "2026-10-10T12:00:00Z",
          updated_at: "2026-10-10T12:01:00Z",
        },
      ]),
    );

    const deploy = await createNetlifyDeployFetcher("t", fetchStub)("basin-fm");

    expect(deploy).toEqual({
      id: "d1",
      state: "ready",
      finishedAt: new Date("2026-10-10T12:00:00Z"),
    });
  });

  it("returns null when the project has no production deploy", async () => {
    const fetchStub = vi.fn(async () => jsonResponse([]));

    expect(
      await createNetlifyDeployFetcher("t", fetchStub)("basin-fm"),
    ).toBeNull();
  });

  it("throws with the status on a non-ok response, without echoing the token", async () => {
    const fetchStub = vi.fn(async () => jsonResponse({}, 401));

    const attempt = createNetlifyDeployFetcher(
      "nfp_secret",
      fetchStub,
    )("basin-fm");

    await expect(attempt).rejects.toThrow(/"basin-fm".*status 401/);
    await expect(attempt).rejects.not.toThrow(/nfp_secret/);
  });

  it("throws on a non-JSON body", async () => {
    const fetchStub = vi.fn(
      async () => new Response("<html>", { status: 200 }),
    );

    await expect(
      createNetlifyDeployFetcher("t", fetchStub)("basin-fm"),
    ).rejects.toThrow(/non-JSON/);
  });

  it("throws on a non-array body", async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ message: "nope" }));

    await expect(
      createNetlifyDeployFetcher("t", fetchStub)("basin-fm"),
    ).rejects.toThrow(/non-array/);
  });

  it("relabels an abort from the shared run budget", async () => {
    const fetchStub = createAbortAwareFetch(() => jsonResponse([]));

    await expect(
      createNetlifyDeployFetcher(
        "t",
        fetchStub,
        createExhaustedDeadline(),
      )("basin-fm"),
    ).rejects.toThrow(/"basin-fm" was aborted/);
  });

  it("rethrows a non-abort network failure unchanged", async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      createNetlifyDeployFetcher("t", fetchStub)("basin-fm"),
    ).rejects.toThrow("fetch failed");
  });
});
