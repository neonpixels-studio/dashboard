import { describe, expect, it, vi } from "vitest";
import { SQL } from "drizzle-orm";
import {
  listEnabledIntegrationConfigs,
  persistProviderResult,
  recordSyncStatus,
} from "../../../server/integrations/persist";
import {
  integrationConfig,
  metricSnapshot,
  syncStatus,
  syndicationPost,
  trafficBreakdown,
} from "../../../server/db/schema";
import type {
  IntegrationConfigRow,
  ProviderResult,
} from "../../../server/integrations/types";

type FakeDb = Parameters<typeof persistProviderResult>[0];

// A minimal thenable query stub: awaitable on its own (the single-write
// branch just `await`s it directly) and, for tables that upsert, chainable
// into onConflictDoUpdate — same shape as tests/server/db/seed.test.ts's
// fake, extended with `then` since persist.ts's writes are also handed
// straight to db.batch() as-is.
function thenableQuery(resolvedValue: unknown = undefined) {
  return {
    then: (resolve: (value: unknown) => void) => resolve(resolvedValue),
  };
}

function createFakeDb() {
  const batch = vi.fn().mockResolvedValue(undefined);
  const where = vi.fn().mockResolvedValue([]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const onConflictDoUpdate = vi.fn().mockReturnValue(thenableQuery());
  const values = vi.fn().mockImplementation((rows: unknown[]) => ({
    ...thenableQuery(),
    onConflictDoUpdate,
    // Distinguish which values() call an onConflictDoUpdate belongs to when
    // a test asserts on it directly, without needing the insert() call's
    // table argument in scope.
    rows,
  }));
  const insert = vi.fn().mockReturnValue({ values });

  return {
    db: { select, insert, batch } as unknown as FakeDb,
    select,
    from,
    where,
    insert,
    values,
    onConflictDoUpdate,
    batch,
  };
}

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

describe("listEnabledIntegrationConfigs", () => {
  it("selects only enabled integration_config rows", async () => {
    const { db, select, from, where } = createFakeDb();

    await listEnabledIntegrationConfigs(db);

    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith(integrationConfig);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

describe("persistProviderResult", () => {
  const EMPTY_RESULT: ProviderResult = {
    metrics: [],
    trafficBreakdown: [],
    syndicationPosts: [],
  };

  it("does not touch the db at all for a fully empty provider result", async () => {
    const { db, insert, batch } = createFakeDb();
    const row = configRow();

    await persistProviderResult(db, row, EMPTY_RESULT);

    expect(insert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("stamps every row with the config row's slug before inserting", async () => {
    const { db, insert, values } = createFakeDb();
    const row = configRow({ slug: "wanderist" });
    const result: ProviderResult = {
      ...EMPTY_RESULT,
      metrics: [
        {
          vendor: "stripe",
          metric: "mrr",
          value: 42,
          period: "current",
          capturedAt: new Date("2026-09-20T00:00:00Z"),
        },
      ],
    };

    await persistProviderResult(db, row, result);

    expect(insert).toHaveBeenCalledWith(metricSnapshot);
    expect(values).toHaveBeenCalledWith([
      {
        vendor: "stripe",
        metric: "mrr",
        value: 42,
        period: "current",
        capturedAt: result.metrics[0]!.capturedAt,
        slug: "wanderist",
      },
    ]);
  });

  it("writes a single populated table directly, without calling db.batch", async () => {
    const { db, batch } = createFakeDb();
    const row = configRow();
    const result: ProviderResult = {
      ...EMPTY_RESULT,
      trafficBreakdown: [
        { channel: "organic", pct: 80, capturedAt: new Date() },
      ],
    };

    await persistProviderResult(db, row, result);

    expect(batch).not.toHaveBeenCalled();
  });

  it("batches every populated table's write into one db.batch call when more than one is populated", async () => {
    const { db, insert, batch } = createFakeDb();
    const row = configRow();
    const result: ProviderResult = {
      metrics: [
        {
          vendor: "stripe",
          metric: "mrr",
          value: 1,
          period: "current",
          capturedAt: new Date(),
        },
      ],
      trafficBreakdown: [
        { channel: "organic", pct: 80, capturedAt: new Date() },
      ],
      syndicationPosts: [
        {
          platform: "medium",
          postRef: "post-1",
          status: "synced",
          syncedAt: new Date(),
        },
      ],
    };

    await persistProviderResult(db, row, result);

    expect(insert).toHaveBeenCalledWith(metricSnapshot);
    expect(insert).toHaveBeenCalledWith(trafficBreakdown);
    expect(insert).toHaveBeenCalledWith(syndicationPost);
    expect(batch).toHaveBeenCalledTimes(1);
    // Exactly one batch item per populated table — not just "an array".
    expect(batch.mock.calls[0]![0]).toHaveLength(3);
  });

  it("upserts syndication_post on (slug, platform, post_ref) instead of duplicating a re-synced post", async () => {
    const { db, onConflictDoUpdate } = createFakeDb();
    const row = configRow();
    const result: ProviderResult = {
      ...EMPTY_RESULT,
      syndicationPosts: [
        {
          platform: "medium",
          postRef: "post-1",
          status: "synced",
          syncedAt: new Date(),
        },
      ],
    };

    await persistProviderResult(db, row, result);

    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          syndicationPost.slug,
          syndicationPost.platform,
          syndicationPost.postRef,
        ],
      }),
    );
    const conflictArgs = onConflictDoUpdate.mock.calls[0]![0];
    // The update side of the upsert must pull from the newly-proposed row
    // (`excluded`), not some fixed/stale value — otherwise a bulk upsert of
    // several posts would write the same status/syncedAt to every row.
    expect(conflictArgs.set.status).toBeInstanceOf(SQL);
    expect(conflictArgs.set.status.queryChunks[0].value).toEqual([
      "excluded.status",
    ]);
    expect(conflictArgs.set.syncedAt).toBeInstanceOf(SQL);
    expect(conflictArgs.set.syncedAt.queryChunks[0].value).toEqual([
      "excluded.synced_at",
    ]);
  });

  it("upserts metric_snapshot on (slug, vendor, metric, period, captured_at) instead of duplicating a re-run backfill row", async () => {
    const { db, insert, onConflictDoUpdate } = createFakeDb();
    const row = configRow({ slug: "basin", vendor: "ga4" });
    const capturedAt = new Date("2026-09-01T00:00:00Z");
    const result: ProviderResult = {
      ...EMPTY_RESULT,
      metrics: [
        {
          vendor: "ga4",
          metric: "sessions",
          value: 123,
          period: "daily",
          capturedAt,
        },
      ],
    };

    await persistProviderResult(db, row, result);

    // metric_snapshot is the only populated table in this fixture, which is
    // what makes `onConflictDoUpdate.mock.calls[0]` below unambiguous —
    // `createFakeDb` shares one onConflictDoUpdate mock across every
    // upserting table, so this guard makes that assumption loud (a failing
    // test) rather than a silent false pass if a later edit adds a second
    // populated array (e.g. syndicationPosts) to this fixture.
    expect(insert.mock.calls).toHaveLength(1);
    expect(insert).toHaveBeenCalledWith(metricSnapshot);
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          metricSnapshot.slug,
          metricSnapshot.vendor,
          metricSnapshot.metric,
          metricSnapshot.period,
          metricSnapshot.capturedAt,
        ],
      }),
    );
    const conflictArgs = onConflictDoUpdate.mock.calls[0]![0];
    // The update side must pull the newly-proposed value from `excluded`, not
    // a fixed/stale one — otherwise a bulk backfill of several days would
    // write the same value to every conflicting row.
    expect(conflictArgs.set.value).toBeInstanceOf(SQL);
    expect(conflictArgs.set.value.queryChunks[0].value).toEqual([
      "excluded.value",
    ]);
  });

  it("dedupes metric rows sharing a conflict key before inserting, keeping the last value", async () => {
    const { db, values } = createFakeDb();
    const row = configRow({ slug: "basin", vendor: "ga4" });
    const capturedAt = new Date("2026-09-01T00:00:00Z");
    const result: ProviderResult = {
      ...EMPTY_RESULT,
      metrics: [
        {
          vendor: "ga4",
          metric: "sessions",
          value: 1,
          period: "daily",
          capturedAt,
        },
        {
          vendor: "ga4",
          metric: "sessions",
          value: 2,
          period: "daily",
          capturedAt,
        },
      ],
    };

    await persistProviderResult(db, row, result);

    // A single INSERT ... VALUES whose rows share a conflict target makes
    // Postgres raise "ON CONFLICT DO UPDATE command cannot affect row a
    // second time" — deduping before the insert (rather than relying on the
    // DB) keeps a same-key duplicate from failing the whole batched sync.
    expect(values).toHaveBeenCalledWith([
      {
        vendor: "ga4",
        metric: "sessions",
        value: 2,
        period: "daily",
        capturedAt,
        slug: "basin",
      },
    ]);
  });
});

describe("recordSyncStatus", () => {
  it("writes ok=true with lastSuccessAt set to runAt on success", async () => {
    const { db, values } = createFakeDb();
    const runAt = new Date("2026-09-20T12:00:00Z");

    await recordSyncStatus(db, {
      slug: "basin",
      vendor: "stripe",
      runAt,
      ok: true,
      error: null,
    });

    expect(values).toHaveBeenCalledWith({
      slug: "basin",
      vendor: "stripe",
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      ok: true,
      error: null,
    });
  });

  it("writes ok=false with a null lastSuccessAt (preserved via the conflict update, not overwritten to null) on failure", async () => {
    const { db, values, onConflictDoUpdate } = createFakeDb();
    const runAt = new Date("2026-09-20T12:00:00Z");

    await recordSyncStatus(db, {
      slug: "basin",
      vendor: "stripe",
      runAt,
      ok: false,
      error: "Sentry 500",
    });

    expect(values).toHaveBeenCalledWith({
      slug: "basin",
      vendor: "stripe",
      lastRunAt: runAt,
      lastSuccessAt: null,
      ok: false,
      error: "Sentry 500",
    });
    const conflictArgs = onConflictDoUpdate.mock.calls[0]![0];
    expect(conflictArgs.target).toEqual([syncStatus.slug, syncStatus.vendor]);
    expect(conflictArgs.set.lastRunAt).toBe(runAt);
    expect(conflictArgs.set.ok).toBe(false);
    expect(conflictArgs.set.error).toBe("Sentry 500");
    // On failure this must be a `sql` fragment referencing the table's own
    // current column (not the literal runAt, which would clobber a prior
    // success) — assert the actual shape, not just "isn't equal to runAt"
    // (which would also pass for null/undefined, the bug this guards).
    expect(conflictArgs.set.lastSuccessAt).toBeInstanceOf(SQL);
    expect(conflictArgs.set.lastSuccessAt.queryChunks).toContain(
      syncStatus.lastSuccessAt,
    );
  });
});
