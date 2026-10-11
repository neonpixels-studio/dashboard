ALTER TYPE "public"."integration_vendor" ADD VALUE 'neon';--> statement-breakpoint
CREATE TABLE "neon_branch" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "neon_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"compute_time_seconds" integer NOT NULL,
	"active_time_seconds" integer NOT NULL,
	"storage_bytes" bigint NOT NULL,
	"data_transfer_bytes" bigint NOT NULL,
	"written_data_bytes" bigint NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "neon_branch_slug_name_idx" ON "neon_branch" USING btree ("slug","name");--> statement-breakpoint
CREATE UNIQUE INDEX "neon_usage_slug_idx" ON "neon_usage" USING btree ("slug");
