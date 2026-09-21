import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../../../../server/integrations/syndication/httpClient";
import { jsonResponse } from "../../../../server/integrations/testing/httpFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("throws a vendorLabel-prefixed 'failed' error (not a bare network error) when the request itself fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      fetchJson("https://example.com", {
        fetchImpl,
        vendorLabel: "Example API",
      }),
    ).rejects.toThrow("Example API request to https://example.com failed.");
  });

  it("throws a vendorLabel-prefixed 'timed out' error (not a generic AbortError) when the request itself aborts", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    });

    await expect(
      fetchJson("https://example.com", {
        fetchImpl,
        vendorLabel: "Example API",
      }),
    ).rejects.toThrow("Example API request to https://example.com timed out.");
  });

  it("throws a vendorLabel-prefixed 'timed out reading the response body' error (not a bare invalid-JSON error) when the body read itself aborts", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      },
    }));

    await expect(
      fetchJson("https://example.com", {
        fetchImpl,
        vendorLabel: "Example API",
      }),
    ).rejects.toThrow("Example API timed out reading the response body.");
  });

  it("throws a vendorLabel-prefixed error (not a bare SyntaxError) when the body isn't valid JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));

    await expect(
      fetchJson("https://example.com", {
        fetchImpl,
        vendorLabel: "Example API",
      }),
    ).rejects.toThrow("Example API returned a body that isn't valid JSON.");
  });

  it("defaults to the global fetch when fetchImpl isn't provided", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchImpl);

    const body = await fetchJson<{ ok: boolean }>("https://example.com", {
      vendorLabel: "Example API",
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(body).toEqual({ ok: true });
  });
});
