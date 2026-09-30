ALTER TABLE "integration_config" ADD COLUMN "last_attempt_at" timestamp with time zone;
--> statement-breakpoint
-- This must run *before* the backfill UPDATE below, not after: neon-http's
-- migrator runs each statement in this file in order (see
-- 0002_add-updated-at-trigger.sql's own comment), and 0002's original
-- trigger function is still the one installed until this statement replaces
-- it. If the backfill ran first, that still-installed original version
-- (which only excludes `updated_at`, not `last_attempt_at`, from its diff)
-- would see every backfilled row's `last_attempt_at` change as a real edit
-- and stamp `updated_at` to the migration's own run time on every one of
-- them — exactly the corruption this replacement exists to prevent.
--
-- server/integrations/persist.ts's recordSyncAttempt updates last_attempt_at
-- alone, every ~15 minutes for every enabled row (see
-- netlify/functions/scheduled-sync.ts) — without this, 0002's trigger would
-- treat that as a real change and bump updated_at on every attempt, turning
-- "config last edited" into "last sync attempt" for every integration_config
-- row. This re-creates the same function with last_attempt_at added to the
-- exclusion set, alongside updated_at itself. `users` has no
-- last_attempt_at column at all, so the extra jsonb key removal is a
-- harmless no-op there — this function is shared by both tables' triggers.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
	IF to_jsonb(NEW) - 'updated_at' - 'last_attempt_at' = to_jsonb(OLD) - 'updated_at' - 'last_attempt_at' THEN
		NEW.updated_at = OLD.updated_at;
		RETURN NEW;
	END IF;
	NEW.updated_at = clock_timestamp();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Backfill from sync_status.last_run_at so existing rotation history isn't
-- thrown away on deploy: without this, every existing row starts at NULL
-- last_attempt_at (sorting as "never attempted", tied on id) and the first
-- post-deploy run picks low-id rows first regardless of how recently they
-- actually synced, rather than continuing the oldest-synced-first rotation
-- already in effect. A row with no sync_status row at all (genuinely never
-- synced) is untouched by this UPDATE and correctly stays NULL. See
-- persist.ts's listEnabledIntegrationConfigs/recordSyncAttempt and
-- schema.ts's own comment on this column for what it's used for going
-- forward.
UPDATE "integration_config" AS "config"
SET "last_attempt_at" = "status"."last_run_at"
FROM "sync_status" AS "status"
WHERE "status"."slug" = "config"."slug"
  AND "status"."vendor" = "config"."vendor"::text;
