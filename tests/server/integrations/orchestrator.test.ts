import { describe, expect, it, vi } from "vitest";
import { runSync } from "../../../server/integrations/orchestrator";
import type {
  SyncOrchestratorDeps,
  SyncStatusWrite,
} from "../../../server/integrations/orchestrator";
import type {
  IntegrationConfig,
  IntegrationConfigRow,
  IntegrationProvider,
  ProviderResult,
} from "../../../server/integrations/types";

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
} {
  const persistProviderResult = vi.fn().mockResolvedValue(undefined);
  const recordSyncStatus = vi.fn().mockResolvedValue(undefined);
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

    expect(fetch).toHaveBeenCalledWith({
      slug: "basin",
      vendor: "stripe",
      externalId: null,
      secret: "resolved-secret",
    });
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
    const brokenRow = configRow({ slug: "wanderist", vendor: "sentry" });
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
      "Sync failed for wanderist:sentry",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();

    expect(summary.outcomes).toEqual(
      expect.arrayContaining([
        { slug: "basin", vendor: "stripe", ok: true },
        { slug: "wanderist", vendor: "sentry", ok: false, error: "Sentry 500" },
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
      slug: "wanderist",
      vendor: "sentry",
      runAt: new Date("2026-09-20T12:00:00Z"),
      ok: false,
      error: "Sentry 500",
    } satisfies SyncStatusWrite);
  });

  it("redacts secret material from the error before writing sync_status", async () => {
    // Representative of a real vendor error: the raw cause can echo the
    // request it just made, including the API key. Issue #27 requires this
    // to be stripped before it ever reaches sync_status.error.
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

    await runSync(deps);

    const [writtenStatus] = deps.recordSyncStatus.mock.calls[0] as [
      SyncStatusWrite,
    ];
    expect(writtenStatus.error).not.toContain("sk_live_leaked");
    expect(writtenStatus.error).not.toContain("api_key=sk_live");
    expect(writtenStatus.error).toContain("[REDACTED]");
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
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to write sync_status for basin:stripe",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it("preserves the original vendor failure reason even when the failure-path sync_status write also throws, without affecting a sibling vendor", async () => {
    const brokenRow = configRow({ slug: "basin", vendor: "stripe" });
    const healthyRow = configRow({ slug: "wanderist", vendor: "sentry" });
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
        { slug: "wanderist", vendor: "sentry", ok: true },
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
  });
});
