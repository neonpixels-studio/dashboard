-- The wanderist.io domain was taken before it could be registered, so the
-- property is now farflung.io. `app/config/apps.ts` is the source of truth for
-- the slug, and per schema.ts's top-of-file comment every table below keys on
-- it by convention rather than by foreign key — so nothing cascades and each
-- table has to be renamed explicitly here. Without this, every existing
-- wanderist row becomes orphaned history: `server/utils/dashboardShaping.ts`
-- joins snapshots to APPS by slug, so the farflung card would read as a
-- never-synced property while its real data sat unreachable under the old
-- slug.
UPDATE "integration_config" SET "slug" = 'farflung' WHERE "slug" = 'wanderist';
--> statement-breakpoint
-- The per-app Clerk/Stripe/GA4/Sentry env vars were renamed with the slug
-- (NUXT_CLERK_SECRET_KEY_WANDERIST -> ..._FARFLUNG). A row still pointing at
-- the old name would fail two ways in
-- `server/integrations/config.ts`: the env var no longer exists, and
-- assertSecretRefIsSafe's trailing-segment check would reject "WANDERIST" as
-- belonging to an unknown app anyway.
UPDATE "integration_config"
SET "secret_ref" = replace("secret_ref", '_WANDERIST', '_FARFLUNG')
WHERE "secret_ref" LIKE '%\_WANDERIST';
--> statement-breakpoint
UPDATE "metric_snapshot" SET "slug" = 'farflung' WHERE "slug" = 'wanderist';
--> statement-breakpoint
UPDATE "traffic_breakdown" SET "slug" = 'farflung' WHERE "slug" = 'wanderist';
--> statement-breakpoint
UPDATE "syndication_post" SET "slug" = 'farflung' WHERE "slug" = 'wanderist';
--> statement-breakpoint
UPDATE "sync_status" SET "slug" = 'farflung' WHERE "slug" = 'wanderist';
