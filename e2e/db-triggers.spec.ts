import { expect, test } from "@playwright/test";
import { getRawSqlClient } from "./helpers/db";

// Verifies the DB-level trigger added by
// server/db/migrations/0002_add-updated-at-trigger.sql: `updated_at` must be
// kept honest by Postgres itself, not just by Drizzle's `$onUpdate` (see
// server/db/schema.ts). Every query below goes straight over the
// @neondatabase/serverless HTTP driver via getRawSqlClient(), bypassing the
// Drizzle query builder entirely, so `$onUpdate` has no path to fire here —
// only the trigger can produce the behavior these tests assert on. Runs
// against the real e2e database that e2e/global-setup.ts already migrates
// before any spec starts.
const sql = getRawSqlClient();

// Postgres timestamp columns here have microsecond resolution, but the JS
// `Date` round-trip through the driver truncates to milliseconds — give the
// clock room to tick a full millisecond between statements so an assertion
// can't pass on a same-millisecond coincidence.
const CLOCK_TICK_ALLOWANCE_MS = 50;

type TimestampedRow = { id: number; updated_at: Date };

function requireRow<Row>(row: Row | undefined, description: string): Row {
  if (!row) {
    throw new Error(`${description} returned no row`);
  }
  return row;
}

function firstTimestampedRow(
  rows: Record<string, unknown>[],
  description: string,
): TimestampedRow {
  return requireRow(rows[0] as TimestampedRow | undefined, description);
}

async function waitForClockToAdvance(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, CLOCK_TICK_ALLOWANCE_MS));
}

async function insertUser(providerId: string): Promise<TimestampedRow> {
  const rows = await sql`
    INSERT INTO "users" (provider_id) VALUES (${providerId})
    RETURNING id, updated_at
  `;
  return firstTimestampedRow(rows, "INSERT INTO users");
}

async function insertIntegrationConfig(slug: string): Promise<TimestampedRow> {
  const rows = await sql`
    INSERT INTO "integration_config" (slug, vendor, enabled)
    VALUES (${slug}, 'sentry', false)
    RETURNING id, updated_at
  `;
  return firstTimestampedRow(rows, "INSERT INTO integration_config");
}

async function deleteUser(userId: number): Promise<void> {
  await sql`DELETE FROM "users" WHERE id = ${userId}`;
}

async function deleteIntegrationConfig(
  integrationConfigId: number,
): Promise<void> {
  await sql`DELETE FROM "integration_config" WHERE id = ${integrationConfigId}`;
}

test.describe("updated_at DB trigger", () => {
  test("a raw UPDATE that changes a users column bumps updated_at", async () => {
    const inserted = await insertUser(`e2e-trigger-users-${Date.now()}`);
    try {
      await waitForClockToAdvance();
      const rows = await sql`
        UPDATE "users" SET provider_id = ${`e2e-trigger-users-${Date.now()}-updated`}
        WHERE id = ${inserted.id} RETURNING updated_at
      `;
      const updated = firstTimestampedRow(rows, "UPDATE users (changed value)");
      expect(updated.updated_at.getTime()).toBeGreaterThan(
        inserted.updated_at.getTime(),
      );
    } finally {
      await deleteUser(inserted.id);
    }
  });

  test("a raw UPDATE that re-writes the same users value leaves updated_at unchanged", async () => {
    const providerId = `e2e-trigger-users-noop-${Date.now()}`;
    const inserted = await insertUser(providerId);
    try {
      await waitForClockToAdvance();
      const rows = await sql`
        UPDATE "users" SET provider_id = ${providerId}
        WHERE id = ${inserted.id} RETURNING updated_at
      `;
      const updated = firstTimestampedRow(rows, "UPDATE users (no-op)");
      expect(updated.updated_at.getTime()).toEqual(
        inserted.updated_at.getTime(),
      );
    } finally {
      await deleteUser(inserted.id);
    }
  });

  test("a no-op UPDATE that also supplies a fresh updated_at is not honored", async () => {
    const providerId = `e2e-trigger-users-noop-fresh-${Date.now()}`;
    const inserted = await insertUser(providerId);
    try {
      await waitForClockToAdvance();
      const rows = await sql`
        UPDATE "users" SET provider_id = ${providerId}, updated_at = ${new Date().toISOString()}
        WHERE id = ${inserted.id} RETURNING updated_at
      `;
      const updated = firstTimestampedRow(
        rows,
        "UPDATE users (no-op, fresh updated_at supplied)",
      );
      expect(updated.updated_at.getTime()).toEqual(
        inserted.updated_at.getTime(),
      );
    } finally {
      await deleteUser(inserted.id);
    }
  });

  test("a no-op UPDATE that supplies a stale updated_at is not honored", async () => {
    const providerId = `e2e-trigger-users-noop-stale-${Date.now()}`;
    const inserted = await insertUser(providerId);
    try {
      await waitForClockToAdvance();
      const rows = await sql`
        UPDATE "users" SET provider_id = ${providerId}, updated_at = '2000-01-01T00:00:00Z'
        WHERE id = ${inserted.id} RETURNING updated_at
      `;
      const updated = firstTimestampedRow(
        rows,
        "UPDATE users (no-op, stale updated_at supplied)",
      );
      expect(updated.updated_at.getTime()).toEqual(
        inserted.updated_at.getTime(),
      );
    } finally {
      await deleteUser(inserted.id);
    }
  });

  test("the trigger overrides a caller-supplied stale updated_at when a real change is made", async () => {
    const inserted = await insertUser(
      `e2e-trigger-users-override-${Date.now()}`,
    );
    try {
      await waitForClockToAdvance();
      const rows = await sql`
        UPDATE "users"
        SET provider_id = ${`e2e-trigger-users-override-${Date.now()}-2`},
            updated_at = '2000-01-01T00:00:00Z'
        WHERE id = ${inserted.id} RETURNING updated_at
      `;
      const updated = firstTimestampedRow(
        rows,
        "UPDATE users (stale updated_at supplied alongside a real change)",
      );
      // Anchored to `inserted.updated_at` (not the 2000-01-01 literal) so
      // this can only pass on a genuine clock_timestamp() stamp, not on the
      // trigger merely leaving OLD.updated_at in place.
      expect(updated.updated_at.getTime()).toBeGreaterThan(
        inserted.updated_at.getTime(),
      );
    } finally {
      await deleteUser(inserted.id);
    }
  });

  test("a raw UPDATE that changes an integration_config column bumps updated_at", async () => {
    const inserted = await insertIntegrationConfig(
      `e2e-trigger-integration-config-${Date.now()}`,
    );
    try {
      await waitForClockToAdvance();
      const rows = await sql`
        UPDATE "integration_config" SET enabled = true
        WHERE id = ${inserted.id} RETURNING updated_at
      `;
      const updated = firstTimestampedRow(rows, "UPDATE integration_config");
      expect(updated.updated_at.getTime()).toBeGreaterThan(
        inserted.updated_at.getTime(),
      );
    } finally {
      await deleteIntegrationConfig(inserted.id);
    }
  });

  test("every table with an updated_at column has a matching, live, row-level BEFORE UPDATE trigger", async () => {
    // Schema-driven, not hardcoded to `users`/`integration_config`: catches
    // the case this issue exists to prevent — a future table gains
    // `updated_at` but nobody wires up the DB-level trigger for it. Checks
    // more than trigger *name*: it must call set_updated_at() (tgfoid), be
    // enabled (tgenabled), and fire FOR EACH ROW BEFORE UPDATE (tgtype bits
    // 1, 2, 16) — a same-named but disabled/mis-wired trigger would
    // otherwise satisfy a name-only check while doing nothing.
    const ROW_LEVEL = 1;
    const BEFORE = 2;
    const UPDATE_EVENT = 16;
    const tablesMissingTrigger = await sql`
      SELECT columns.table_name
      FROM information_schema.columns
      JOIN information_schema.tables
        ON tables.table_schema = columns.table_schema
       AND tables.table_name = columns.table_name
       AND tables.table_type = 'BASE TABLE'
      WHERE columns.table_schema = 'public'
        AND columns.column_name = 'updated_at'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_trigger
          JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid
          JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
          WHERE pg_namespace.nspname = 'public'
            AND pg_class.relname = columns.table_name
            AND NOT pg_trigger.tgisinternal
            AND pg_trigger.tgname = columns.table_name || '_set_updated_at'
            AND pg_trigger.tgfoid = 'public.set_updated_at'::regproc
            AND pg_trigger.tgenabled <> 'D'
            AND (pg_trigger.tgtype & ${ROW_LEVEL}) <> 0
            AND (pg_trigger.tgtype & ${BEFORE}) <> 0
            AND (pg_trigger.tgtype & ${UPDATE_EVENT}) <> 0
        )
    `;
    expect(tablesMissingTrigger).toEqual([]);
  });
});
