import { describe, expect, it, vi } from "vitest";
import { getTableColumns, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  listEnabledIntegrationConfigs,
  listSyncHealthRows,
  persistProviderResult,
  recordConfigSyncAttempt,
  recordSyncAttempt,
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
  // listEnabledIntegrationConfigs' chain: select -> from -> where ->
  // orderBy, with orderBy's return value being what's actually awaited (a
  // plain resolved array stands in for the real query result).
  const orderBy = vi.fn().mockResolvedValue([]);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  // Defaults to "claimed" (a non-empty .returning() result) — recordSyncStatus
  // never calls .returning() at all (it just awaits the onConflictDoUpdate()
  // result directly via `.then`, which thenableQuery() already provides), so
  // this only matters to recordSyncAttempt's tests (the sync_status one),
  // which override it via `returning.mockResolvedValue([])` for the "lost
  // the race" case.
  const returning = vi.fn().mockResolvedValue([{ slug: "danholloran" }]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({
    ...thenableQuery(),
    returning,
  });
  const values = vi.fn().mockImplementation((rows: unknown[]) => ({
    ...thenableQuery(),
    onConflictDoUpdate,
    // Distinguish which values() call an onConflictDoUpdate belongs to when
    // a test asserts on it directly, without needing the insert() call's
    // table argument in scope.
    rows,
  }));
  const insert = vi.fn().mockReturnValue({ values });

  // recordConfigSyncAttempt's chain: update -> set -> where -> returning,
  // with returning's return value being what's actually awaited. Defaults to
  // one matched row (`[{ id: 1 }]`) — the common case every test other than
  // the dedicated zero-match test below exercises — since
  // recordConfigSyncAttempt throws when this resolves empty.
  const updateReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set: updateSet });

  return {
    db: { select, insert, update, batch } as unknown as FakeDb,
    select,
    from,
    where,
    orderBy,
    insert,
    values,
    onConflictDoUpdate,
    update,
    updateSet,
    updateWhere,
    updateReturning,
    returning,
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
    lastAttemptAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// Renders a drizzle SQL fragment to literal query text without a live
// connection, so this test can assert on the *actual* join/order-by SQL
// (including the integration_vendor -> text cast — see persist.ts's
// comment on why it's required) rather than `expect.any(Object)`, which
// would pass just as well for a broken query as a correct one.
function renderSql(fragment: SQL): string {
  return new PgDialect().sqlToQuery(fragment).sql;
}

// `enabled = $1` renders identically whether $1 binds true or false, so any
// assertion that only checks the SQL text (renderSql above) is blind to
// exactly the flip that would sync integrations the owner disabled. Params
// are asserted separately from SQL text here for that reason.
function renderSqlParams(fragment: SQL): unknown[] {
  return new PgDialect().sqlToQuery(fragment).params;
}

describe("listEnabledIntegrationConfigs", () => {
  it("selects every integration_config column, filtered to enabled rows, ordered oldest-attempted-first — no join to sync_status", async () => {
    const { db, select, from, where, orderBy } = createFakeDb();

    await listEnabledIntegrationConfigs(db);

    expect(select).toHaveBeenCalledWith(getTableColumns(integrationConfig));
    expect(from).toHaveBeenCalledWith(integrationConfig);

    // Asserted on the rendered SQL text AND its bound param (not just
    // "where was called") so a predicate that filtered on the wrong column,
    // or bound `false` instead of `true`, couldn't pass silently — either
    // would sync integrations the owner explicitly disabled.
    const [whereArg] = where.mock.calls[0] as [SQL];
    expect(renderSql(whereArg)).toBe('"integration_config"."enabled" = $1');
    expect(renderSqlParams(whereArg)).toEqual([true]);

    // Nulls (never attempted) first, then oldest-attempted first, with the
    // row id as a stable tiebreaker — this is what lets runSync's
    // budget-limited skip path (orchestrator.ts) rotate which rows lose out
    // instead of starving the same tail every time the budget is hit.
    // Ordered on integration_config.last_attempt_at (stamped by
    // recordConfigSyncAttempt before provider.fetch — see orchestrator.ts's
    // syncOneIntegration), not sync_status.last_run_at, and with no join at
    // all — every enabled row already has exactly one integration_config
    // row, so there's nothing to join for this ordering key (see
    // schema.ts's comment on last_attempt_at for why it lives here).
    const [orderByArg] = orderBy.mock.calls[0] as [SQL];
    expect(renderSql(orderByArg)).toBe(
      '"integration_config"."last_attempt_at" asc nulls first, "integration_config"."id" asc',
    );
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
    const row = configRow({ slug: "farflung" });
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
        slug: "farflung",
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

  it("dedupes metric rows sharing a conflict key before inserting, keeping the last value, while leaving distinct-key rows untouched", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, values } = createFakeDb();
    const row = configRow({ slug: "basin", vendor: "ga4" });
    const capturedAt = new Date("2026-09-01T00:00:00Z");
    const otherDay = new Date("2026-09-02T00:00:00Z");
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
        // Same (vendor, metric, period, capturedAt) as above — the duplicate
        // conflict key this test is pinning the dedupe behavior on.
        {
          vendor: "ga4",
          metric: "sessions",
          value: 2,
          period: "daily",
          capturedAt,
        },
        // A distinct capturedAt: a different conflict key, so it must
        // survive untouched. Without this row, a dedupe implementation that
        // collapsed every row down to one (e.g. `rows.slice(-1)`) would also
        // make this test pass.
        {
          vendor: "ga4",
          metric: "sessions",
          value: 9,
          period: "daily",
          capturedAt: otherDay,
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
      {
        vendor: "ga4",
        metric: "sessions",
        value: 9,
        period: "daily",
        capturedAt: otherDay,
        slug: "basin",
      },
    ]);
    // The drop must be logged (never silent — see dedupeByConflictKey's
    // comment), exactly once, and only for the colliding pair — the
    // surviving otherDay row's key must never be reported as dropped.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        conflictKey: JSON.stringify([
          "basin",
          "ga4",
          "sessions",
          "daily",
          capturedAt.toISOString(),
        ]),
      }),
    );
    warnSpy.mockRestore();
  });

  it("dedupes syndication_post rows sharing a conflict key before inserting, keeping the last status", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, values } = createFakeDb();
    const row = configRow();
    const result: ProviderResult = {
      ...EMPTY_RESULT,
      syndicationPosts: [
        {
          platform: "devto",
          postRef: "post-1",
          status: "pending",
          syncedAt: null,
        },
        // Same (slug, platform, postRef) — an offset-paginated provider
        // (e.g. devto/hashnode draining pages with no dedupe of their own)
        // can return the same post twice if a new post shifts the page
        // window mid-drain.
        {
          platform: "devto",
          postRef: "post-1",
          status: "synced",
          syncedAt: new Date("2026-09-01T00:00:00Z"),
        },
      ],
    };

    await persistProviderResult(db, row, result);

    expect(values).toHaveBeenCalledWith([
      {
        platform: "devto",
        postRef: "post-1",
        status: "synced",
        syncedAt: new Date("2026-09-01T00:00:00Z"),
        slug: row.slug,
      },
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        conflictKey: JSON.stringify([row.slug, "devto", "post-1"]),
      }),
    );
    warnSpy.mockRestore();
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

describe("recordConfigSyncAttempt", () => {
  it("updates integration_config, not sync_status — every enabled row already has exactly one integration_config row, so this always has somewhere to land, including a vendor's very first-ever attempt", async () => {
    const { db, update } = createFakeDb();
    const runAt = new Date("2026-09-20T12:00:00Z");

    await recordConfigSyncAttempt(db, {
      slug: "basin",
      vendor: "stripe",
      runAt,
    });

    expect(update).toHaveBeenCalledWith(integrationConfig);
  });

  it("passes only lastAttemptAt to set()", async () => {
    const { db, updateSet } = createFakeDb();
    const runAt = new Date("2026-09-20T12:00:00Z");

    await recordConfigSyncAttempt(db, {
      slug: "basin",
      vendor: "stripe",
      runAt,
    });

    expect(updateSet).toHaveBeenCalledWith({ lastAttemptAt: runAt });
  });

  it("scopes the update to exactly this (slug, vendor) pair, casting the plain-string vendor to the integration_vendor enum (not the column to text) so the comparison can still use integration_config_slug_vendor_idx", async () => {
    const { db, updateWhere } = createFakeDb();
    const runAt = new Date("2026-09-20T12:00:00Z");

    await recordConfigSyncAttempt(db, {
      slug: "basin",
      vendor: "stripe",
      runAt,
    });

    const [whereArg] = updateWhere.mock.calls[0] as [SQL];
    expect(renderSql(whereArg)).toBe(
      '("integration_config"."slug" = $1 and "integration_config"."vendor" = $2::integration_vendor)',
    );
    expect(renderSqlParams(whereArg)).toEqual(["basin", "stripe"]);
  });

  it("throws when the update matches no integration_config row, rather than silently leaving last_attempt_at frozen", async () => {
    const { db, updateReturning } = createFakeDb();
    updateReturning.mockResolvedValue([]);
    const runAt = new Date("2026-09-20T12:00:00Z");

    // A no-match here (the row was deleted, or its vendor changed, between
    // listEnabledIntegrationConfigs's read and this write) must not be a
    // silent no-op — that would reproduce the exact rotation gap this
    // column exists to close. orchestrator.ts's writeBestEffort is what
    // catches and logs this in the real call path; recordConfigSyncAttempt's
    // own job is just to make the failure loud instead of swallowing it here.
    await expect(
      recordConfigSyncAttempt(db, { slug: "basin", vendor: "stripe", runAt }),
    ).rejects.toThrow(
      "recordConfigSyncAttempt matched no integration_config row for basin:stripe",
    );
  });
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("recordSyncAttempt", () => {
  it("writes only slug/vendor/lastAttemptedAt on insert — no opinion on lastRunAt/ok/error/lastSuccessAt", async () => {
    const { db, values } = createFakeDb();
    const attemptedAt = new Date("2026-09-20T12:00:00Z");

    await recordSyncAttempt(
      db,
      "danholloran",
      "medium",
      attemptedAt,
      ONE_DAY_MS,
    );

    expect(values).toHaveBeenCalledWith({
      slug: "danholloran",
      vendor: "medium",
      lastAttemptedAt: attemptedAt,
    });
  });

  it("on conflict, updates only lastAttemptedAt — leaving every other sync_status column exactly as recordSyncStatus last set it", async () => {
    const { db, onConflictDoUpdate } = createFakeDb();
    const attemptedAt = new Date("2026-09-20T12:00:00Z");

    await recordSyncAttempt(
      db,
      "danholloran",
      "medium",
      attemptedAt,
      ONE_DAY_MS,
    );

    const conflictArgs = onConflictDoUpdate.mock.calls[0]![0];
    expect(conflictArgs.target).toEqual([syncStatus.slug, syncStatus.vendor]);
    expect(conflictArgs.set).toEqual({ lastAttemptedAt: attemptedAt });
  });

  it("gates the conflict update on staleness — no attempt yet, or the last one at least minIntervalMs ago — closing the check-then-act race between two overlapping callers", async () => {
    const { db, onConflictDoUpdate } = createFakeDb();
    const attemptedAt = new Date("2026-09-20T12:00:00Z");
    const minIntervalMs = ONE_DAY_MS;

    await recordSyncAttempt(
      db,
      "danholloran",
      "medium",
      attemptedAt,
      minIntervalMs,
    );

    const conflictArgs = onConflictDoUpdate.mock.calls[0]![0];
    expect(conflictArgs.setWhere).toBeInstanceOf(SQL);
    // The OR'd condition must reference last_attempted_at (both IS NULL and
    // the staleness comparison), and the staleness cutoff must be exactly
    // attemptedAt - minIntervalMs, computed in JS rather than left to a
    // vendor-agnostic function to know Medium's own interval.
    const sql = renderSql(conflictArgs.setWhere);
    expect(sql.toLowerCase()).toContain('"last_attempted_at" is null');
    expect(sql).toContain('"last_attempted_at" <=');
    expect(renderSqlParams(conflictArgs.setWhere)).toEqual([
      new Date(attemptedAt.getTime() - minIntervalMs).toISOString(),
    ]);
  });

  it("returns true (claimed) when .returning() reports a row — the insert path, or a conflict whose setWhere matched", async () => {
    const { db, returning } = createFakeDb();
    returning.mockResolvedValue([{ slug: "danholloran" }]);

    await expect(
      recordSyncAttempt(db, "danholloran", "medium", new Date(), ONE_DAY_MS),
    ).resolves.toBe(true);
  });

  it("returns false (lost the race) when .returning() reports no row — a concurrent call's conflict update already claimed this window", async () => {
    const { db, returning } = createFakeDb();
    returning.mockResolvedValue([]);

    await expect(
      recordSyncAttempt(db, "danholloran", "medium", new Date(), ONE_DAY_MS),
    ).resolves.toBe(false);
  });
});

describe("listSyncHealthRows", () => {
  it("joins sync_status to enabled integration_config rows only", async () => {
    const rows = [{ slug: "basin", vendor: "stripe" }];
    const where = vi.fn().mockResolvedValue(rows);
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });

    const result = await listSyncHealthRows({
      select,
    } as unknown as Parameters<typeof listSyncHealthRows>[0]);

    expect(result).toBe(rows);
    expect(from).toHaveBeenCalledWith(syncStatus);
    expect(innerJoin.mock.calls[0]![0]).toBe(integrationConfig);
    const dialect = new PgDialect();
    const joinSql = dialect.sqlToQuery(innerJoin.mock.calls[0]![1]).sql;
    expect(joinSql).toBe(
      '("integration_config"."slug" = "sync_status"."slug" and "integration_config"."vendor"::text = "sync_status"."vendor")',
    );
    const whereQuery = dialect.sqlToQuery(where.mock.calls[0]![0]);
    expect(whereQuery.sql).toContain('"enabled" = $1');
    expect(whereQuery.params).toEqual([true]);
  });
});
