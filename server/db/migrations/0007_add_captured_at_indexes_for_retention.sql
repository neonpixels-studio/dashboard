-- Plain CREATE INDEX takes a write lock while it builds (drizzle runs
-- migrations in a transaction, so CONCURRENTLY is unavailable). If these
-- tables are large in production, create both indexes manually with
-- CREATE INDEX CONCURRENTLY first; IF NOT EXISTS then makes this a no-op.
CREATE INDEX IF NOT EXISTS "metric_snapshot_captured_at_idx" ON "metric_snapshot" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_breakdown_captured_at_idx" ON "traffic_breakdown" USING btree ("captured_at");