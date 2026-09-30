import { afterEach, describe, expect, it, vi } from "vitest";
import { runSync } from "../../../server/integrations/orchestrator";
import type {
  SyncAttemptWrite,
  SyncOrchestratorDeps,
  SyncStatusWrite,
} from "../../../server/integrations/orchestrator";
import type {
  IntegrationConfig,
  IntegrationConfigRow,
  IntegrationProvider,
  ProviderResult,
} from "../../../server/integrations/types";

// Belt-and-suspenders alongside each test's own mockRestore(): if a test's
// assertions throw before reaching its restore call, this still stops a
// stubbed console.error/warn (or, for the fake-timers test below, a fake
// clock) from leaking into every later test in the file.
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function configRow(
  overrides: Partial<IntegrationConfigRow> = {},
): IntegrationConfigRow {
  return {
    id: 1,
    slug: "basin",
    vendor: "stripe",
    enabled: true,
    externalId: null,
    secretRef: null,
    encryptedSecret: null,
    lastAttemptAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const EMPTY_RESULT: ProviderResult = {
  metrics: [],
  trafficBreakdown: [],
  syndicationPosts: [],
};

function stubProvider(
  vendor: string,
  fetch: IntegrationProvider["fetch"],
): IntegrationProvider {
  return { vendor, fetch };
}

// Builds a working SyncOrchestratorDeps from real fakes rather than
// vi.fn()-everything, so each test only overrides the one collaborator it's
// exercising and the rest behave like a "normal" sync run.
function createDeps(
  overrides: Partial<SyncOrchestratorDeps> = {},
): SyncOrchestratorDeps & {
  persistProviderResult: ReturnType<typeof vi.fn>;
  recordSyncStatus: ReturnType<typeof vi.fn>;
  recordConfigSyncAttempt: ReturnType<typeof vi.fn>;
} {
  const persistProviderResult = vi.fn().mockResolvedValue(undefined);
  const recordSyncStatus = vi.fn().mockResolvedValue(undefined);
  const recordConfigSyncAttempt = vi.fn().mockResolvedValue(undefined);
  return {
    listEnabledConfigRows: async () => [],
    resolveConfig: (row: IntegrationConfigRow): IntegrationConfig => ({
      slug: row.slug,
      vendor: row.vendor,
      externalId: row.externalId,
      secret: "resolved-secret",
    }),
    registry: { get: () => undefined },
    persistProviderResult,
    recordSyncStatus,
    recordConfigSyncAttempt,
    now: () => new Date("2026-09-20T12:00:00Z"),
    ...overrides,
  };
}

describe("runSync", () => {
  it("does nothing and returns no outcomes when no rows are enabled", async () => {
    const deps = createDeps({ listEnabledConfigRows: async () => [] });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual([]);
    expect(deps.persistProviderResult).not.toHaveBeenCalled();
    expect(deps.recordSyncStatus).not.toHaveBeenCalled();
  });

  it("persists the provider's result and records an ok sync_status row on success", async () => {
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const providerResult: ProviderResult = {
      ...EMPTY_RESULT,
      metrics: [
        {
          vendor: "stripe",
          metric: "mrr",
          value: 100,
          period: "current",
          capturedAt: new Date("2026-09-20T12:00:00Z"),
        },
      ],
    };
    const fetch = vi.fn().mockResolvedValue(providerResult);
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
    });

    const summary = await runSync(deps);

    // Second arg is the shared FetchDeadline runSync builds for this run
    // (see "threads the same shared deadline into every row's fetch call"
    // below for a dedicated assertion on its shape) — asserted loosely here
    // so this test stays focused on the config argument.
    expect(fetch).toHaveBeenCalledWith(
      {
        slug: "basin",
        vendor: "stripe",
        externalId: null,
        secret: "resolved-secret",
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        remainingMs: expect.any(Function),
      }),
    );
    expect(deps.persistProviderResult).toHaveBeenCalledWith(
      row,
      providerResult,
    );
    expect(deps.recordSyncStatus).toHaveBeenCalledWith({
      slug: "basin",
      vendor: "stripe",
      runAt: new Date("2026-09-20T12:00:00Z"),
      ok: true,
      error: null,
    } satisfies SyncStatusWrite);
    expect(summary.outcomes).toEqual([
      { slug: "basin", vendor: "stripe", ok: true },
    ]);
  });

  it("isolates a failing vendor: records its failure without persisting, while a sibling vendor still succeeds", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const healthyRow = configRow({ slug: "basin", vendor: "stripe" });
    const brokenRow = configRow({ slug: "farflung", vendor: "sentry" });
    const healthyFetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const brokenFetch = vi.fn().mockRejectedValue(new Error("Sentry 500"));
    const deps = createDeps({
      listEnabledConfigRows: async () => [healthyRow, brokenRow],
      registry: {
        get: (vendor: string) =>
          vendor === "stripe"
            ? stubProvider("stripe", healthyFetch)
            : stubProvider("sentry", brokenFetch),
      },
    });

    const summary = await runSync(deps);

    // A failing vendor must show up in server-side logs, not just silently
    // in the DB — nothing else surfaces a total-outage run otherwise.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Sync failed for farflung:sentry",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();

    expect(summary.outcomes).toEqual(
      expect.arrayContaining([
        { slug: "basin", vendor: "stripe", ok: true },
        { slug: "farflung", vendor: "sentry", ok: false, error: "Sentry 500" },
      ]),
    );
    // The failing vendor never reaches persistProviderResult at all — no
    // partial/zeroed rows for it, only a sync_status failure.
    expect(deps.persistProviderResult).toHaveBeenCalledTimes(1);
    expect(deps.persistProviderResult).toHaveBeenCalledWith(
      healthyRow,
      EMPTY_RESULT,
    );
    expect(deps.recordSyncStatus).toHaveBeenCalledWith({
      slug: "farflung",
      vendor: "sentry",
      runAt: new Date("2026-09-20T12:00:00Z"),
      ok: false,
      error: "Sentry 500",
    } satisfies SyncStatusWrite);
  });

  it("redacts secret material from the error before writing sync_status or returning the outcome", async () => {
    // Representative of a real vendor error: the raw cause can echo the
    // request it just made, including the API key. Issue #27 requires this
    // to be stripped before it ever reaches sync_status.error — and since
    // server/api/sync.post.ts returns the outcome array as-is over HTTP,
    // the returned outcome must be scrubbed the same way, or the same
    // secret leaks through that response instead.
    const secretBearingCause = new Error(
      "Request to https://api.stripe.com/v1/subscriptions?api_key=sk_live_leaked failed with 401",
    );
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: {
        get: () =>
          stubProvider("stripe", vi.fn().mockRejectedValue(secretBearingCause)),
      },
    });

    const summary = await runSync(deps);

    const [writtenStatus] = deps.recordSyncStatus.mock.calls[0] as [
      SyncStatusWrite,
    ];
    expect(writtenStatus.error).not.toContain("sk_live_leaked");
    expect(writtenStatus.error).not.toContain("api_key=sk_live");
    expect(writtenStatus.error).toContain("[REDACTED]");

    const [outcome] = summary.outcomes;
    expect(outcome?.error).not.toContain("sk_live_leaked");
    expect(outcome?.error).toContain("[REDACTED]");
  });

  it("redacts the resolved secret's exact value even when it matches no known pattern", async () => {
    // An opaque token (e.g. a Sentry auth token) matches none of
    // redactSecrets()'s pattern-based passes — this only gets caught
    // because syncOneIntegration passes the row's own resolved secret
    // through as the exact-match fallback.
    const row = configRow({ slug: "farflung", vendor: "sentry" });
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      resolveConfig: (): IntegrationConfig => ({
        slug: row.slug,
        vendor: row.vendor,
        externalId: row.externalId,
        secret: "opaque-sentry-auth-token",
      }),
      registry: {
        get: () =>
          stubProvider(
            "sentry",
            vi
              .fn()
              .mockRejectedValue(
                new Error(
                  "Sentry request failed: token opaque-sentry-auth-token was rejected",
                ),
              ),
          ),
      },
    });

    const summary = await runSync(deps);

    const [writtenStatus] = deps.recordSyncStatus.mock.calls[0] as [
      SyncStatusWrite,
    ];
    expect(writtenStatus.error).not.toContain("opaque-sentry-auth-token");
    expect(writtenStatus.error).toContain("[REDACTED]");
    expect(summary.outcomes[0]?.error).not.toContain(
      "opaque-sentry-auth-token",
    );
  });

  it("records a failure when no provider is registered for the row's vendor", async () => {
    const row = configRow({ slug: "basin", vendor: "ga4" });
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => undefined },
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual([
      {
        slug: "basin",
        vendor: "ga4",
        ok: false,
        error: 'No provider registered for vendor "ga4".',
      },
    ]);
    expect(deps.persistProviderResult).not.toHaveBeenCalled();
  });

  it("stamps a sync attempt before calling provider.fetch, so a hang or a failed outcome write can't leave last_attempt_at frozen (issue #58)", async () => {
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const callOrder: string[] = [];
    const recordConfigSyncAttempt = vi.fn().mockImplementation(async () => {
      // Yields at least one microtask before recording — proves the order
      // below depends on syncOneIntegration genuinely awaiting the attempt
      // write before moving on. A mock that records synchronously would
      // still push "attempt" first even if the source fired the write
      // without awaiting it (fire-and-forget), since the mock body runs to
      // completion before returning control to the caller either way.
      await Promise.resolve();
      callOrder.push("attempt");
    });
    // Deliberately not `async` — pushes synchronously the instant it's
    // called, with no microtask delay of its own, so it would win a race
    // against a not-actually-awaited attempt write.
    const fetch = vi.fn().mockImplementation(() => {
      callOrder.push("fetch");
      return Promise.resolve(EMPTY_RESULT);
    });
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      recordConfigSyncAttempt,
    });

    await runSync(deps);

    // The attempt write must be awaited and complete before fetch is even
    // called — a fetch that hangs (or one whose provider isn't registered)
    // must not be able to prevent last_attempt_at from advancing.
    expect(callOrder).toEqual(["attempt", "fetch"]);
    expect(recordConfigSyncAttempt).toHaveBeenCalledWith({
      slug: "basin",
      vendor: "stripe",
      runAt: new Date("2026-09-20T12:00:00Z"),
    } satisfies SyncAttemptWrite);
  });

  it("stamps a sync attempt before the failure outcome write, even when no provider is registered for the vendor", async () => {
    const row = configRow({ slug: "basin", vendor: "ga4" });
    const callOrder: string[] = [];
    const recordConfigSyncAttempt = vi.fn().mockImplementation(async () => {
      // See the previous test for why this yield is what makes the
      // ordering assertion below meaningful rather than incidental.
      await Promise.resolve();
      callOrder.push("attempt");
    });
    const recordSyncStatus = vi.fn().mockImplementation(() => {
      callOrder.push("status");
      return Promise.resolve(undefined);
    });
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => undefined },
      recordConfigSyncAttempt,
      recordSyncStatus,
    });

    await runSync(deps);

    // No provider means provider.fetch is never reached at all — this is
    // the case that most needs the attempt stamp to land first, since
    // there's no fetch step here to hang, only the failure-path outcome
    // write below it, which the attempt stamp must still precede.
    expect(callOrder).toEqual(["attempt", "status"]);
    expect(recordConfigSyncAttempt).toHaveBeenCalledWith({
      slug: "basin",
      vendor: "ga4",
      runAt: new Date("2026-09-20T12:00:00Z"),
    } satisfies SyncAttemptWrite);
  });

  it("still attempts the fetch and reports the true outcome when recordConfigSyncAttempt itself fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const recordConfigSyncAttempt = vi
      .fn()
      .mockRejectedValue(new Error("attempt write failed"));
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      recordConfigSyncAttempt,
    });

    const summary = await runSync(deps);

    // A failure recording the attempt is exactly as best-effort as the
    // outcome writes below it — it must not stop the fetch from being
    // tried, or turn a run that actually succeeded into a reported failure.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(summary.outcomes).toEqual([
      { slug: "basin", vendor: "stripe", ok: true },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to record sync attempt for basin:stripe",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it("records a failure when resolving the config throws (e.g. a missing secret)", async () => {
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn();
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      resolveConfig: () => {
        throw new Error("integration_config references an unset env var");
      },
      registry: { get: () => stubProvider("stripe", fetch) },
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual([
      {
        slug: "basin",
        vendor: "stripe",
        ok: false,
        error: "integration_config references an unset env var",
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still reports every other vendor when persisting one succeeded result throws", async () => {
    const failsToPersistRow = configRow({ slug: "basin", vendor: "stripe" });
    const healthyRow = configRow({ slug: "markpost", vendor: "stripe" });
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const persistProviderResult = vi
      .fn()
      .mockRejectedValueOnce(new Error("db unreachable"))
      .mockResolvedValueOnce(undefined);
    const deps = createDeps({
      listEnabledConfigRows: async () => [failsToPersistRow, healthyRow],
      registry: { get: () => stubProvider("stripe", fetch) },
      persistProviderResult,
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual(
      expect.arrayContaining([
        { slug: "basin", vendor: "stripe", ok: false, error: "db unreachable" },
        { slug: "markpost", vendor: "stripe", ok: true },
      ]),
    );
  });

  it("still reports ok:true when the vendor sync succeeded but the sync_status write itself throws — the data is already durable", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const recordSyncStatus = vi
      .fn()
      .mockRejectedValue(new Error("sync_status write failed"));
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      recordSyncStatus,
    });

    const summary = await runSync(deps);

    // The write failure is logged, not promoted to a false vendor failure —
    // otherwise a transient bookkeeping error would report a run that
    // actually succeeded (fetch + persist both completed) as broken.
    expect(summary.outcomes).toEqual([
      { slug: "basin", vendor: "stripe", ok: true },
    ]);
    expect(recordSyncStatus).toHaveBeenCalledTimes(1);
    // The pre-fetch attempt stamp already landed before this outcome write
    // ever ran, and separately from it — this is precisely gap (2) from
    // runSync's rotation-guarantee comment (an outcome write that keeps
    // failing): integration_config.last_attempt_at already advanced via
    // recordConfigSyncAttempt, so this row isn't stuck even though its
    // sync_status outcome write failed.
    expect(deps.recordConfigSyncAttempt).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to write sync_status for basin:stripe",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it("preserves the original vendor failure reason even when the failure-path sync_status write also throws, without affecting a sibling vendor", async () => {
    const brokenRow = configRow({ slug: "basin", vendor: "stripe" });
    const healthyRow = configRow({ slug: "farflung", vendor: "sentry" });
    const brokenFetch = vi.fn().mockRejectedValue(new Error("Stripe 500"));
    const healthyFetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const recordSyncStatus = vi.fn(
      async (status: SyncStatusWrite): Promise<void> => {
        if (status.slug === "basin") {
          throw new Error("sync_status permanently unreachable");
        }
      },
    );
    const deps = createDeps({
      listEnabledConfigRows: async () => [brokenRow, healthyRow],
      registry: {
        get: (vendor: string) =>
          vendor === "stripe"
            ? stubProvider("stripe", brokenFetch)
            : stubProvider("sentry", healthyFetch),
      },
      recordSyncStatus,
    });

    const summary = await runSync(deps);

    // The fetch itself failed ("Stripe 500") *and* the failure-path
    // sync_status write also failed for "basin" — the outcome must still
    // report the original vendor error, not the write failure that happened
    // while trying to record it. The sibling vendor, with no write problems
    // of its own, is unaffected.
    expect(summary.outcomes).toEqual(
      expect.arrayContaining([
        { slug: "basin", vendor: "stripe", ok: false, error: "Stripe 500" },
        { slug: "farflung", vendor: "sentry", ok: true },
      ]),
    );
  });

  it("shares one runAt across every row in the same run", async () => {
    const rows = [
      configRow({ slug: "basin", vendor: "stripe" }),
      configRow({ slug: "markpost", vendor: "stripe" }),
    ];
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    let callCount = 0;
    const deps = createDeps({
      listEnabledConfigRows: async () => rows,
      registry: { get: () => stubProvider("stripe", fetch) },
      // Distinct per call, unlike createDeps' constant default — proves
      // runSync calls now() exactly once and reuses the result, rather than
      // syncOneIntegration calling it per row.
      now: () => new Date(2026, 8, 20, 12, 0, ++callCount),
    });

    await runSync(deps);

    const runAts = deps.recordSyncStatus.mock.calls.map(
      ([status]: [SyncStatusWrite]) => status.runAt.getTime(),
    );
    expect(new Set(runAts).size).toBe(1);
    expect(deps.recordSyncStatus).toHaveBeenCalledTimes(2);

    // The pre-fetch attempt stamp shares the same run-scoped runAt too —
    // it's the same clock reading, just written at a different point in
    // each row's attempt.
    const attemptRunAts = deps.recordConfigSyncAttempt.mock.calls.map(
      ([attempt]: [SyncAttemptWrite]) => attempt.runAt.getTime(),
    );
    expect(new Set(attemptRunAts)).toEqual(new Set(runAts));
    expect(deps.recordConfigSyncAttempt).toHaveBeenCalledTimes(2);
  });

  it("threads the same shared deadline into every row's fetch call, across batches", async () => {
    // Issue #62: the run budget bounds batch admission, not any one
    // provider's own request timeout — a shared deadline threaded into
    // every provider.fetch call closes that gap. One deadline per run means
    // a row admitted in a later batch gets exactly as little time left as
    // an earlier row already spent, not its own fresh budget.
    const rows = Array.from({ length: 7 }, (_, index) =>
      configRow({ slug: `app-${index}`, vendor: "stripe" }),
    );
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const deps = createDeps({
      listEnabledConfigRows: async () => rows,
      registry: { get: () => stubProvider("stripe", fetch) },
    });

    await runSync(deps);

    const deadlinesPassedToFetch = fetch.mock.calls.map(
      ([, deadline]) => deadline,
    );
    expect(deadlinesPassedToFetch).toHaveLength(7);
    expect(new Set(deadlinesPassedToFetch).size).toBe(1);
    expect(deadlinesPassedToFetch[0]).toEqual(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        remainingMs: expect.any(Function),
      }),
    );
  });

  it("actually aborts an in-flight fetch once the shared run budget elapses, and clears its own timer afterward", async () => {
    // Unlike the shape-only assertion above, this proves the deadline built
    // by runSync is a REAL one — a stub that just carries the right fields
    // but never fires (e.g. an accidentally-swapped-in NO_DEADLINE) would
    // leave this test hanging instead of passing.
    vi.useFakeTimers();
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn(
      (_config: IntegrationConfig, deadline?: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          deadline?.signal.addEventListener("abort", () => {
            reject(deadline.signal.reason);
          });
        }),
    );
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: 100,
    });

    const summaryPromise = runSync(deps);
    await vi.advanceTimersByTimeAsync(100);
    const summary = await summaryPromise;

    expect(summary.outcomes).toEqual([
      {
        slug: "basin",
        vendor: "stripe",
        ok: false,
        error: expect.stringContaining("Shared run budget"),
      },
    ]);
    // Proves createRunDeadline's `dispose()` ran (via runSync's try/finally)
    // — a leaked timer here would otherwise keep a serverless function
    // instance alive past the response, or leak across test files.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a provider that never looks at its deadline argument at all (e.g. Clerk, whose SDK has no timeout/AbortSignal seam)", async () => {
    // IntegrationProvider's `deadline` param is optional precisely so a
    // provider like this can ignore it (see types.ts's own comment) — the
    // orchestrator's "an individual provider's fetch can't exceed the
    // overall run budget" guarantee (issue #62) must still hold for it via
    // syncOneIntegration's own race against the deadline, not rely on every
    // provider choosing to cooperate.
    vi.useFakeTimers();
    const row = configRow({ slug: "danholloran", vendor: "clerk" });
    const fetch = vi.fn(() => new Promise<never>(() => {})); // never settles
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("clerk", fetch) },
      runBudgetMs: 100,
    });

    const summaryPromise = runSync(deps);
    await vi.advanceTimersByTimeAsync(100);
    const summary = await summaryPromise;

    expect(summary.outcomes).toEqual([
      {
        slug: "danholloran",
        vendor: "clerk",
        ok: false,
        error: expect.stringContaining("Shared run budget"),
      },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats a NaN runBudgetMs as no effective bound, rather than an instantly-expired deadline that fails every row", async () => {
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: Number.NaN,
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual([
      { slug: "basin", vendor: "stripe", ok: true },
    ]);
  });

  it("treats an Infinity runBudgetMs as no effective bound, and hands the provider a deadline whose remainingMs() never runs out", async () => {
    const row = configRow({ slug: "basin", vendor: "stripe" });
    let observedRemainingMs: number | undefined;
    const fetch = vi.fn().mockImplementation(async (_config, deadline) => {
      observedRemainingMs = deadline.remainingMs();
      return EMPTY_RESULT;
    });
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: Number.POSITIVE_INFINITY,
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual([
      { slug: "basin", vendor: "stripe", ok: true },
    ]);
    expect(observedRemainingMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("batches concurrent fetches in groups of exactly 5 rather than awaiting every row at once", async () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      configRow({ slug: `app-${index}`, vendor: "stripe" }),
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const fetch = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return EMPTY_RESULT;
    });
    const deps = createDeps({
      listEnabledConfigRows: async () => rows,
      registry: { get: () => stubProvider("stripe", fetch) },
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toHaveLength(12);
    expect(summary.skipped).toEqual([]);
    // 12 rows / BATCH_SIZE 5 gives two full batches of 5 before the
    // trailing batch of 2, so peak concurrency must hit exactly 5 — not
    // just "at most 5", which would also pass for a regression down to
    // fully serial (maxInFlight 1).
    expect(maxInFlight).toBe(5);
  });

  it("always admits the first batch even with an already-spent budget, so a slow listEnabledConfigRows() can't starve every run to zero progress", async () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      configRow({ slug: `app-${index}`, vendor: "stripe" }),
    );
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const deps = createDeps({
      listEnabledConfigRows: async () => rows,
      registry: { get: () => stubProvider("stripe", fetch) },
      // A budget of -1 is already "spent" before the loop's very first
      // check — if that check gated the first batch the same as every
      // later one, this run (and every run after it, since the DB latency
      // that ate the budget would repeat) would sync nothing, forever. The
      // first batch runs regardless; only the second is cut off.
      runBudgetMs: -1,
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toHaveLength(5);
    expect(summary.skipped).toEqual(
      rows.slice(5).map(({ slug, vendor }) => ({ slug, vendor })),
    );
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(deps.persistProviderResult).toHaveBeenCalledTimes(5);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("2 of 7 enabled row(s) left unattempted"),
    );
    consoleWarnSpy.mockRestore();
  });

  it("admits a batch already in flight's worth of work, then stops before the next batch once the budget is spent mid-run", async () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      configRow({ slug: `app-${index}`, vendor: "stripe" }),
    );
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    // monotonicNow() is called once for startedAt, then once per per-batch
    // budget check (7 rows / BATCH_SIZE 5 = 2 batches, so 2 checks): 0ms
    // elapsed for the first check (batch one proceeds), 150ms elapsed for
    // the second (batch two is skipped, given a 100ms budget below). A
    // plain counter over a fixture array, rather than spying on the global
    // Date, so this doesn't leak into other tests and doesn't hard-code
    // runSync's exact internal call count via mockReturnValueOnce chaining.
    const elapsedFixture = [0, 0, 150];
    let tick = 0;
    const monotonicNow = () =>
      elapsedFixture[tick++] ?? elapsedFixture.at(-1) ?? 0;
    const deps = createDeps({
      listEnabledConfigRows: async () => rows,
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: 100,
      monotonicNow,
    });

    const summary = await runSync(deps);

    // Only the first batch (5 rows) ran; the trailing 2-row batch was never
    // started once the budget check saw it was spent.
    expect(summary.outcomes).toHaveLength(5);
    expect(summary.skipped).toEqual(
      rows.slice(5).map(({ slug, vendor }) => ({ slug, vendor })),
    );
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("treats a runBudgetMs above setTimeout's max delay (~24.8 days) as no effective bound, rather than the ~1ms Node coerces it to", async () => {
    // Node's setTimeout silently truncates any delay above 2147483647ms to
    // 1ms instead of throwing — left unguarded, this would fail every row
    // in the run just like an unguarded NaN/Infinity budget would.
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: 1e10,
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual([
      { slug: "basin", vendor: "stripe", ok: true },
    ]);
  });

  it("never starts a row's provider.fetch once the shared deadline has already aborted, rather than discarding a wasted call", async () => {
    vi.useFakeTimers();
    // 6 rows over BATCH_SIZE 5 forces two batches: the first batch's rows
    // hang until the shared deadline aborts them, so by the time the
    // second batch is admitted the deadline has already fired.
    const hangingRows = Array.from({ length: 5 }, (_, index) =>
      configRow({ slug: `app-${index}`, vendor: "stripe" }),
    );
    const lateRow = configRow({ slug: "late", vendor: "sentry" });
    const hangingFetch = vi.fn(
      (_config: IntegrationConfig, deadline?: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          deadline?.signal.addEventListener("abort", () => {
            reject(deadline.signal.reason);
          });
        }),
    );
    const lateFetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    // A fixed fixture, not the real clock, so the batch-admission loop's
    // own budget check stays independent of the fake timers driving the
    // deadline below — this proves the SECOND batch is admitted (not
    // skipped by the admission check) yet still never calls lateFetch,
    // because the deadline itself has already aborted by then.
    const elapsedFixture = [0, 0, 10];
    let tick = 0;
    const monotonicNow = () =>
      elapsedFixture[tick++] ?? elapsedFixture.at(-1) ?? 0;
    const deps = createDeps({
      listEnabledConfigRows: async () => [...hangingRows, lateRow],
      registry: {
        get: (vendor: string) =>
          vendor === "stripe"
            ? stubProvider("stripe", hangingFetch)
            : stubProvider("sentry", lateFetch),
      },
      runBudgetMs: 50,
      monotonicNow,
    });

    const summaryPromise = runSync(deps);
    await vi.advanceTimersByTimeAsync(50);
    const summary = await summaryPromise;

    expect(lateFetch).not.toHaveBeenCalled();
    expect(summary.outcomes).toContainEqual({
      slug: "late",
      vendor: "sentry",
      ok: false,
      error: expect.stringContaining("Shared run budget"),
    });
  });

  it("logs a stray provider rejection that arrives after the shared deadline already decided the race", async () => {
    vi.useFakeTimers();
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const row = configRow({ slug: "basin", vendor: "stripe" });
    let rejectStray: ((cause: unknown) => void) | undefined;
    const fetch = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectStray = reject;
        }),
    );
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: 50,
    });

    const summaryPromise = runSync(deps);
    await vi.advanceTimersByTimeAsync(50);
    // The deadline has now aborted and syncOneIntegration has already
    // recorded the row's outcome; the provider's own promise is still
    // unsettled (its `.catch` below is the only thing still attached).
    rejectStray?.(new Error("vendor auth failure"));
    await vi.advanceTimersByTimeAsync(0);
    await summaryPromise;

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Provider fetch for basin:stripe settled after the shared run budget was already exhausted",
      ),
      expect.any(Error),
    );
  });

  it("removes its abort listener once a provider wins the race, rather than leaving it attached to the shared signal forever", async () => {
    // The leak this guards against only shows up on the WINNER path: the
    // listener is registered with `{ once: true }`, so when the deadline
    // itself fires first, the platform's own "once" bookkeeping already
    // removes it — there'd be nothing to prove here. It's the opposite
    // case (the provider settles before the deadline ever fires) where
    // nothing auto-removes the listener unless raceAgainstDeadline's own
    // `.finally` does it explicitly.
    const addEventListenerSpy = vi.spyOn(
      AbortSignal.prototype,
      "addEventListener",
    );
    const removeEventListenerSpy = vi.spyOn(
      AbortSignal.prototype,
      "removeEventListener",
    );
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: 5_000,
    });

    await runSync(deps);

    const abortListenerAdds = addEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "abort",
    );
    const abortListenerRemoves = removeEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "abort",
    );
    expect(abortListenerAdds.length).toBeGreaterThan(0);
    expect(abortListenerRemoves.length).toBe(abortListenerAdds.length);
  });

  it("does not double-log an ordinary provider rejection that wins the race before the deadline ever fires", async () => {
    // The stray-rejection warning above only fires once `deadline.signal
    // .aborted` is already true — an ordinary failure (the row simply
    // rejects, deadline never involved) must be left to syncOneIntegration's
    // own "Sync failed" log alone, or every normal failure would be logged
    // twice under a misleading "settled after the shared run budget" label.
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const row = configRow({ slug: "basin", vendor: "stripe" });
    const fetch = vi.fn().mockRejectedValue(new Error("vendor auth failure"));
    const deps = createDeps({
      listEnabledConfigRows: async () => [row],
      registry: { get: () => stubProvider("stripe", fetch) },
      runBudgetMs: 5_000,
    });

    const summary = await runSync(deps);

    expect(summary.outcomes).toEqual([
      { slug: "basin", vendor: "stripe", ok: false, error: expect.any(String) },
    ]);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Sync failed for basin:stripe",
      expect.any(Error),
    );
  });
});
