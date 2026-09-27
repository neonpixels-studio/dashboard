import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const flushMock = vi.fn();

vi.mock("@sentry/nuxt", () => ({
  init: (...args: unknown[]) => initMock(...args),
  flush: (...args: unknown[]) => flushMock(...args),
}));

// initSentry() memoizes across calls via module-scoped state, so each test
// needs a fresh module instance to observe "first call initializes" in
// isolation from the others.
async function importFreshSentryModule() {
  vi.resetModules();
  return import("../../../netlify/functions/sentry");
}

describe("initSentry", () => {
  beforeEach(() => {
    initMock.mockReset();
    flushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("initializes the Sentry client with the DSN and a dev trace rate", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    vi.stubEnv("NODE_ENV", "development");
    const { initSentry } = await importFreshSentryModule();

    initSentry();

    expect(initMock).toHaveBeenCalledWith({
      dsn: "https://example@o0.ingest.sentry.io/1",
      tracesSampleRate: 1.0,
    });
  });

  it("uses a reduced trace rate in production", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    vi.stubEnv("NODE_ENV", "production");
    const { initSentry } = await importFreshSentryModule();

    initSentry();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.1 }),
    );
  });

  it("only initializes once across repeated calls", async () => {
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    const { initSentry } = await importFreshSentryModule();

    initSentry();
    initSentry();
    initSentry();

    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("logs a visible warning when SENTRY_DSN is unset, since Sentry.init otherwise fails silently", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { initSentry } = await importFreshSentryModule();

    initSentry();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("SENTRY_DSN is not set"),
    );
    // Still calls Sentry.init (matching sentry.server.config.ts/client's own
    // behavior) rather than skipping it, so the SDK stays in the same state
    // it would have without this guard — the guard only adds visibility.
    expect(initMock).toHaveBeenCalledOnce();
  });

  it("never throws when Sentry.init itself fails, since monitoring must not break the caller", async () => {
    vi.stubEnv("SENTRY_DSN", "not-a-valid-dsn");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    initMock.mockImplementation(() => {
      throw new Error("malformed DSN");
    });
    const { initSentry } = await importFreshSentryModule();

    expect(() => initSentry()).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to initialize Sentry",
      expect.any(Error),
    );
  });
});

describe("flushSentry", () => {
  beforeEach(() => {
    initMock.mockReset();
    flushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("flushes queued events before the worker freezes", async () => {
    flushMock.mockResolvedValue(true);
    const { flushSentry } = await importFreshSentryModule();

    await flushSentry();

    expect(flushMock).toHaveBeenCalledWith(2000);
  });

  it("never throws when the flush itself rejects", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    flushMock.mockRejectedValue(new Error("transport closed"));
    const { flushSentry } = await importFreshSentryModule();

    await expect(flushSentry()).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to flush Sentry before the worker froze",
      expect.any(Error),
    );
  });

  it("logs (without throwing) when the flush times out instead of rejecting", async () => {
    // Sentry.flush() resolves to `false` on a timeout — it does not reject
    // — so this is a distinct drop case from the rejection above and needs
    // its own visible signal, not just a silent `false` return.
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    flushMock.mockResolvedValue(false);
    const { flushSentry } = await importFreshSentryModule();

    await expect(flushSentry()).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Sentry flush timed out"),
    );
  });
});
