import { describe, expect, it, vi, afterEach } from "vitest";

// Mocked at the real external boundary (the Sentry SDK itself), not at
// server/utils/errorReporting.ts or netlify/functions/sentry.ts — so the
// actual reportError/reportErrorCondition/initSentry/flushSentry code under
// test still runs, and both its console output and its Sentry calls are
// observable from here in one place. Matches the mocking style in
// tests/server/utils/errorReporting.test.ts and
// tests/netlify/functions/sentry.test.ts.
const captureExceptionMock = vi.fn();
const captureMessageMock = vi.fn();
const initMock = vi.fn();
const captureCheckInMock = vi.fn().mockReturnValue("check-in-id");
const flushMock = vi.fn().mockResolvedValue(true);

vi.mock("@sentry/nuxt", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
  captureCheckIn: (...args: unknown[]) => captureCheckInMock(...args),
  init: (...args: unknown[]) => initMock(...args),
  flush: (...args: unknown[]) => flushMock(...args),
}));

// Stubbed so tests never decrypt the real committed .env.production (with a
// local .env.keys present, that would inject live production secrets).
const loadEnvMock = vi.fn();
vi.mock("../../../netlify/functions/env", () => ({
  loadEnv: () => loadEnvMock(),
}));

import scheduledSync, {
  config,
  MAX_REPORTED_BODY_LENGTH,
} from "../../../netlify/functions/scheduled-sync";
import { FLUSH_TIMEOUT_MS } from "../../../netlify/functions/sentry";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
  // Restores any console spy a test installed (e.g. the console.warn spy
  // below) even if that test's own assertions failed before reaching its
  // own restore call — otherwise a stubbed console leaks into every
  // subsequent test in this file.
  vi.restoreAllMocks();
  // Runs AFTER restoreAllMocks (which would otherwise wipe flushMock's
  // default implementation too) so every test starts from the same known
  // state: no recorded calls, and flush "succeeding" by default.
  captureExceptionMock.mockClear();
  captureMessageMock.mockClear();
  initMock.mockClear();
  captureCheckInMock.mockClear();
  flushMock.mockClear();
  flushMock.mockResolvedValue(true);
  loadEnvMock.mockReset();
});

describe("scheduled-sync config", () => {
  it("declares a 15-minute cron schedule", () => {
    // Exact match (not just "looks like 5 cron fields") so an accidental
    // edit to the schedule is caught here rather than only noticed
    // once the cadence silently changes in production.
    expect(config.schedule).toBe("*/15 * * * *");
  });
});

describe("scheduledSync cron monitor", () => {
  it("brackets a successful run with in_progress then ok check-ins", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 200 }),
      ) as unknown as typeof fetch;

    await scheduledSync();

    expect(captureCheckInMock.mock.calls[0][0]).toMatchObject({
      status: "in_progress",
    });
    expect(captureCheckInMock.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "ok",
      checkInId: "check-in-id",
    });
  });

  it("ends with an error check-in when the run throws", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    vi.stubEnv("URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(scheduledSync()).rejects.toThrow(/process\.env\.URL/);

    expect(captureCheckInMock.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "error",
      checkInId: "check-in-id",
    });
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

  it("initializes Sentry before running, not merely at some point during the call", async () => {
    // initSentry() memoizes across calls via module-scoped state in
    // netlify/functions/sentry.ts, so this uses its own fresh module
    // instance (vi.resetModules(), same pattern as
    // tests/netlify/functions/sentry.test.ts's importFreshSentryModule)
    // instead of relying on being the first scheduledSync() call in file
    // execution order.
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.resetModules();
    const { default: freshScheduledSync } =
      await import("../../../netlify/functions/scheduled-sync");

    await freshScheduledSync();

    expect(initMock).toHaveBeenCalledOnce();
    // A call count alone would still pass if initSentry() moved to run
    // after the actual sync work — e.g. inside runScheduledSync's own try
    // block — which would lose any error captured during that work.
    expect(initMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });

  it("reads the trigger secret from the decrypted env file, not a pre-set Netlify var", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "");
    loadEnvMock.mockImplementation(() => {
      process.env.NUXT_SYNC_TRIGGER_SECRET = "decrypted-secret";
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await scheduledSync();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: { authorization: "Bearer decrypted-secret" },
      }),
    );
  });

  it("fails before syncing when the env file can't be decrypted", async () => {
    loadEnvMock.mockImplementation(() => {
      throw new Error("MISSING_PRIVATE_KEY");
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(scheduledSync()).rejects.toThrow("MISSING_PRIVATE_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the site URL isn't set, after reporting the failure to Sentry and flushing", async () => {
    vi.stubEnv("URL", "");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(scheduledSync()).rejects.toThrow(/process\.env\.URL/);

    // The outer safety-net catch in scheduledSync reports anything
    // runScheduledSync doesn't already report itself, then flushes before
    // rethrowing — see its own comment.
    expect(captureExceptionMock).toHaveBeenCalledOnce();
    expect(flushMock).toHaveBeenCalledWith(FLUSH_TIMEOUT_MS);
  });

  it("throws when the trigger secret isn't set, after reporting the failure to Sentry and flushing", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(scheduledSync()).rejects.toThrow(/NUXT_SYNC_TRIGGER_SECRET/);

    expect(captureExceptionMock).toHaveBeenCalledOnce();
    expect(flushMock).toHaveBeenCalledWith(FLUSH_TIMEOUT_MS);
  });

  it("flushes Sentry even on the successful path", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ outcomes: [] }), { status: 200 }),
      ) as unknown as typeof fetch;

    await scheduledSync();

    expect(flushMock).toHaveBeenCalledWith(FLUSH_TIMEOUT_MS);
  });

  it("returns a 502 (without throwing) when /api/sync itself responds non-2xx, and reports the status/body to Sentry", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      ) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(502);
    expect(captureMessageMock).toHaveBeenCalledWith(
      "scheduled-sync: POST /api/sync responded with a non-2xx status",
      expect.objectContaining({
        extra: { status: 401, body: "Unauthorized" },
      }),
    );
  });

  it("truncates an oversized non-2xx response body before sending it to Sentry", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const oversizedBody = "x".repeat(5_000);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(oversizedBody, { status: 500 }),
      ) as unknown as typeof fetch;

    await scheduledSync();

    const [, context] = captureMessageMock.mock.calls[0];
    expect((context.extra.body as string).length).toBe(
      MAX_REPORTED_BODY_LENGTH,
    );
  });

  it("returns a 502 (without throwing) when the request itself never completes, e.g. a timeout or DNS failure, and reports the underlying error to Sentry", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const connectionError = new Error("ECONNRESET");
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(connectionError) as unknown as typeof fetch;

    const response = await scheduledSync();

    expect(response.status).toBe(502);
    expect(captureExceptionMock).toHaveBeenCalledWith(
      connectionError,
      expect.objectContaining({
        tags: {
          reportSite:
            "scheduled-sync: POST /api/sync request failed to complete",
        },
      }),
    );
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
      skipped: [{ slug: "farflung", vendor: "sentry" }],
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
      "scheduled-sync: every attempted integration failed this run",
      { attemptedCount: 1, unattemptedCount: 1 },
    );
    // This is the case reportErrorCondition's Sentry reporting exists for
    // (see README's "Error monitoring" section) — asserting only the console
    // line above would still pass if this call were ever accidentally
    // dropped.
    expect(captureMessageMock).toHaveBeenCalledWith(
      "scheduled-sync: every attempted integration failed this run",
      expect.objectContaining({
        level: "error",
        extra: { attemptedCount: 1, unattemptedCount: 1 },
      }),
    );
  });

  it("returns a 502 when a full batch's worth of attempts all failed, even though the budget also left rows skipped — a slow-failing outage shouldn't hide behind budget pressure", async () => {
    vi.stubEnv("URL", "https://dashboard.example.com");
    vi.stubEnv("NUXT_SYNC_TRIGGER_SECRET", "shared-secret");
    const summary = {
      outcomes: [
        { slug: "basin", vendor: "stripe", ok: false, error: "500" },
        { slug: "markpost", vendor: "stripe", ok: false, error: "500" },
        { slug: "farflung", vendor: "stripe", ok: false, error: "500" },
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
        { slug: "farflung", vendor: "sentry", ok: false, error: "500" },
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
      skipped: [{ slug: "farflung", vendor: "sentry" }],
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
      expect.stringContaining("farflung:sentry"),
    );
    // Restoration is handled by the file-level afterEach above, even if
    // the assertions above this line fail.
  });
});
