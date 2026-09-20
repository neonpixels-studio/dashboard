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
