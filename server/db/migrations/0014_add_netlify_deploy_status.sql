ALTER TYPE "public"."integration_vendor" ADD VALUE 'netlify';--> statement-breakpoint
CREATE TABLE "deploy_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"deploy_id" text NOT NULL,
	"state" text NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "deploy_status_slug_idx" ON "deploy_status" USING btree ("slug");