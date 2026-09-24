import { describe, expect, it, vi, afterEach } from "vitest";
import scheduledSync, {
  config,
} from "../../../netlify/functions/scheduled-sync";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
  // Restores any console spy a test installed (e.g. the console.warn spy
  // below) even if that test's own assertions failed before reaching its
  // own restore call — otherwise a stubbed console leaks into every
  // subsequent test in this file.
  vi.restoreAllMocks();
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

  it("still returns 200, but logs an error, when every attempted outcome failed and the budget also left rows skipped — that's budget pressure, not a confirmed total outage, but must not go unremarked", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const summary = {
      outcomes: [
        { slug: "basin", vendor: "stripe", ok: false, error: "expired key" },
      ],
      skipped: [{ slug: "wanderist", vendor: "sentry" }],
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(summary), { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    // A 502 here would be a false alarm — most enabled rows were never
    // attempted — but the all-failed subset is real and must still surface
    // at error level, not buried in logSkippedRows' plain warn.
    expect(response.status).toBe(200);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("all 1 attempted integration(s) failed"),
    );
  });

  it("returns a 502 when a full batch's worth of attempts all failed, even though the budget also left rows skipped — a slow-failing outage shouldn't hide behind budget pressure", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const summary = {
      outcomes: [
        { slug: "basin", vendor: "stripe", ok: false, error: "500" },
        { slug: "markpost", vendor: "stripe", ok: false, error: "500" },
        { slug: "wanderist", vendor: "stripe", ok: false, error: "500" },
        { slug: "grimicorn", vendor: "stripe", ok: false, error: "500" },
        { slug: "neonpixels", vendor: "stripe", ok: false, error: "500" },
      ],
      skipped: [{ slug: "danholloran", vendor: "ga4" }],
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(summary), { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(502);
  });

  it("still returns 200 (no crash) when outcomes/skipped aren't arrays at all — a malformed contract degrades to 'can't tell', not 'everything failed'", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ outcomes: "nope", skipped: {} }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(200);
  });

  it("still returns 200 when outcomes contains malformed items — an item missing `ok` can't be judged a failure", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ outcomes: [null, {}] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(200);
  });

  it("falls back to 'unknown' identifiers when a skipped row itself is malformed", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const summary = {
      outcomes: [{ slug: "basin", vendor: "stripe", ok: true }],
      skipped: [null],
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(summary), { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(200);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown:unknown"),
    );
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

  it("logs (but still returns 200 for) a summary reporting rows the run budget left unattempted", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const summary = {
      outcomes: [{ slug: "basin", vendor: "stripe", ok: true }],
      skipped: [{ slug: "wanderist", vendor: "sentry" }],
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(summary), { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    // Skipped rows are expected system behavior under budget pressure, not
    // a scheduler-level failure — the run still answers 200 — but they must
    // be visible in the invocation log, not silently dropped.
    expect(response.status).toBe(200);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("wanderist:sentry"),
    );
    // Restoration is handled by the file-level afterEach above, even if
    // the assertions above this line fail.
  });
});
