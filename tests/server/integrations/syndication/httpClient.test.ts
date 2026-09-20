import { describe, expect, it, vi } from "vitest";
import { fetchJson } from "../../../../server/integrations/syndication/httpClient";
import { jsonResponse } from "../../../../server/integrations/testing/httpFixtures";

describe("fetchJson", () => {
  it("returns the parsed JSON body on a 2xx response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));

    const body = await fetchJson<{ ok: boolean }>("https://example.com", {
      fetchImpl,
      vendorLabel: "Example API",
    });

    expect(body).toEqual({ ok: true });
  });

  it("passes method/headers/body through to fetchImpl", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));

    await fetchJson("https://example.com", {
      method: "POST",
      headers: { "X-Test": "1" },
      body: "payload",
      fetchImpl,
      vendorLabel: "Example API",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Test": "1" },
        body: "payload",
      }),
    );
  });

  it("throws a vendorLabel-prefixed error on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500));

    await expect(
      fetchJson("https://example.com", {
        fetchImpl,
        vendorLabel: "Example API",
      }),
    ).rejects.toThrow("Example API responded with 500 Error.");
  });

  it("defaults to the global fetch when fetchImpl isn't provided", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchImpl);

    const body = await fetchJson<{ ok: boolean }>("https://example.com", {
      vendorLabel: "Example API",
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(body).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });
});
