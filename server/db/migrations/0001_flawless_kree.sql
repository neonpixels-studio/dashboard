CREATE TYPE "public"."integration_vendor" AS ENUM('ga4', 'stripe', 'clerk', 'sentry', 'medium', 'hashnode', 'devto');--> statement-breakpoint
CREATE TYPE "public"."syndication_status" AS ENUM('synced', 'pending', 'failed');--> statement-breakpoint
CREATE TABLE "integration_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"vendor" "integration_vendor" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"external_id" text,
	"secret_ref" text,
	"encrypted_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_config_single_secret" CHECK (num_nonnulls("integration_config"."secret_ref", "integration_config"."encrypted_secret") <= 1)
);
--> statement-breakpoint
CREATE TABLE "metric_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"vendor" text NOT NULL,
	"metric" text NOT NULL,
	"value" numeric NOT NULL,
	"period" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"vendor" text NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"ok" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "syndication_post" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"platform" text NOT NULL,
	"post_ref" text NOT NULL,
	"status" "syndication_status" NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "traffic_breakdown" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"channel" text NOT NULL,
	"pct" numeric(5, 2) NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traffic_breakdown_pct_range" CHECK ("traffic_breakdown"."pct" >= 0 AND "traffic_breakdown"."pct" <= 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_config_slug_vendor_idx" ON "integration_config" USING btree ("slug","vendor");--> statement-breakpoint
CREATE INDEX "metric_snapshot_slug_metric_captured_at_idx" ON "metric_snapshot" USING btree ("slug","metric","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sync_status_slug_vendor_idx" ON "sync_status" USING btree ("slug","vendor");--> statement-breakpoint
CREATE UNIQUE INDEX "syndication_post_slug_platform_post_ref_idx" ON "syndication_post" USING btree ("slug","platform","post_ref");--> statement-breakpoint
CREATE INDEX "traffic_breakdown_slug_captured_at_idx" ON "traffic_breakdown" USING btree ("slug","captured_at" DESC NULLS LAST);