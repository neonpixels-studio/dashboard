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
});
