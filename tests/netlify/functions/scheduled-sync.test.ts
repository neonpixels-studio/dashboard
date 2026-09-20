import { describe, expect, it, vi, afterEach } from "vitest";
import scheduledSync, {
  config,
} from "../../../netlify/functions/scheduled-sync";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
});

describe("scheduled-sync config", () => {
  it("declares a 15-minute cron schedule", () => {
    // Exact match (not just "looks like 5 cron fields") so an accidental
    // edit to SYNC_SCHEDULE_CRON is caught here rather than only noticed
    // once the cadence silently changes in production.
    expect(config.schedule).toBe("*/15 * * * *");
  });
});

describe("scheduledSync", () => {
  it("POSTs to <site url>/api/sync with the trigger secret as a Bearer token", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(mockFetch).toHaveBeenCalledWith(
      new URL("/api/sync", "https://dashboard.example.com"),
      {
        method: "POST",
        headers: { authorization: "Bearer shared-secret" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(response.status).toBe(200);
  });

  it("throws when the site URL isn't set", async () => {
    vi.stubEnv("URL", "");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");

    await expect(scheduledSync()).rejects.toThrow(/process\.env\.URL/);
  });

  it("throws when the trigger secret isn't set", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "");

    await expect(scheduledSync()).rejects.toThrow(/NUXT_SYNC_TRIGGER_SECRET/);
  });

  it("returns a 502 (without throwing) when /api/sync itself responds non-2xx", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(502);
  });

  it("returns a 502 (without throwing) when the request itself never completes, e.g. a timeout or DNS failure", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(502);
  });

  it("returns a 502 (without throwing) when a non-2xx response's body itself fails to read", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const unreadableResponse = {
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("body stream errored")),
    } as unknown as Response;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(unreadableResponse) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(502);
  });

  it("returns a 502 when every outcome in the summary failed, even though /api/sync itself answered 200", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const summary = {
      outcomes: [
        { slug: "basin", vendor: "stripe", ok: false, error: "expired key" },
        { slug: "markpost", vendor: "stripe", ok: false, error: "expired key" },
      ],
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(summary), { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(502);
  });

  it("still returns 200 when only some outcomes failed — that's normal per-vendor isolation, not a scheduler-level problem", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const summary = {
      outcomes: [
        { slug: "basin", vendor: "stripe", ok: true },
        { slug: "wanderist", vendor: "sentry", ok: false, error: "500" },
      ],
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(summary), { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(200);
  });

  it("still returns 200 when the 200 response body isn't valid JSON — 'can't tell' is not 'everything failed'", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("not json", { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(200);
  });

  it("returns 200 for zero enabled integrations (an empty outcomes array)", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ outcomes: [] }), { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(200);
  });
});
