-- Custom SQL migration file, put your code below! --

-- Drizzle's `$onUpdate` (see server/db/schema.ts) only stamps `updated_at`
-- when a write goes through the query builder. A raw SQL UPDATE, a Drizzle
-- Studio edit, or any other write path bypasses it and leaves `updated_at`
-- stale. This trigger is a DB-level backstop that keeps `updated_at` honest
-- no matter how a row is written. `$onUpdate` stays in the schema as-is —
-- this is belt-and-suspenders, not a replacement.
--
-- `clock_timestamp()` (not `now()`) because `now()` is
-- `transaction_timestamp()` — frozen at transaction start — so inside a
-- multi-statement transaction it would stop advancing between writes to the
-- same row and could even predate a caller-supplied `$onUpdate` value from
-- earlier in that same transaction. `clock_timestamp()` reads the wall clock
-- at the moment this row actually gets written, matching what `$onUpdate`
-- itself does with `new Date()`.
--
-- The `to_jsonb(...) - 'updated_at'` comparison skips the bump for a true
-- no-op UPDATE (every non-`updated_at` column re-written with its existing
-- value) so `updated_at` only moves when a row's data actually changes. This
-- has to live in the function body, not a trigger `WHEN` clause: Drizzle's
-- `$onUpdate` always puts a fresh `updated_at` on `NEW` for its own writes,
-- so a `WHEN (OLD.* IS DISTINCT FROM NEW.*)` clause would always see a diff
-- and never skip anything on that path. Excluding `updated_at` from the
-- comparison here makes the skip apply uniformly regardless of write path.
-- On the skip branch `NEW.updated_at` is forced back to `OLD.updated_at`
-- (not left as whatever the caller supplied) — otherwise a no-op UPDATE that
-- also names an arbitrary `updated_at` value (e.g. a hand-written backdate)
-- would sail through unchanged, which is exactly the staleness/tampering
-- this trigger exists to prevent.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
	IF to_jsonb(NEW) - 'updated_at' = to_jsonb(OLD) - 'updated_at' THEN
		NEW.updated_at = OLD.updated_at;
		RETURN NEW;
	END IF;
	NEW.updated_at = clock_timestamp();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- neon-http's migrator runs each statement individually over HTTP, outside a
-- transaction, and only records the migration as applied once every
-- statement in the file has succeeded. `DROP ... IF EXISTS` before each
-- `CREATE TRIGGER` makes a re-run after a partial failure (e.g. one
-- statement in this file fails, the migration never gets recorded, and the
-- migrator replays the whole file from the top) safe instead of erroring
-- with "trigger already exists". `CREATE OR REPLACE FUNCTION` above already
-- has the same replay-safety built in.
DROP TRIGGER IF EXISTS users_set_updated_at ON "users";
--> statement-breakpoint
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON "users"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS integration_config_set_updated_at ON "integration_config";
--> statement-breakpoint
CREATE TRIGGER integration_config_set_updated_at
BEFORE UPDATE ON "integration_config"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
