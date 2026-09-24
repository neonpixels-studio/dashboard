-- Every environment that ran even one real GA4 sync before this migration
-- has exact-duplicate (slug, vendor, metric, period, captured_at) rows: the
-- PERIOD_DAILY backfill in server/integrations/ga4/provider.ts re-emits the
-- same ~30 days on every sync, and until persist.ts's upsert (added
-- alongside this migration) the old code path blind-inserted them. Creating
-- the unique index below without deduping first would abort with a
-- "duplicate key value violates unique constraint" error on any such
-- database. This keeps the newest row (highest id) per key, matching the
-- upsert's own "last write wins" semantics.
--
-- Both statements below take an ACCESS EXCLUSIVE lock on metric_snapshot for
-- their duration (the DELETE via its self-join scan, CREATE UNIQUE INDEX
-- inherently) and block all reads/writes to it meanwhile. Fine at this
-- table's current size; once the daily backfill has been running a long
-- while, run this during a maintenance window rather than mid-traffic.
DELETE FROM "metric_snapshot" older
USING "metric_snapshot" newer
WHERE older."slug" = newer."slug"
	AND older."vendor" = newer."vendor"
	AND older."metric" = newer."metric"
	AND older."period" = newer."period"
	AND older."captured_at" = newer."captured_at"
	AND older."id" < newer."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "metric_snapshot_slug_vendor_metric_period_captured_at_idx" ON "metric_snapshot" USING btree ("slug","vendor","metric","period","captured_at");
