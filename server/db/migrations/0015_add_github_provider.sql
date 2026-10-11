ALTER TYPE "public"."integration_vendor" ADD VALUE 'github';--> statement-breakpoint
CREATE TABLE "github_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"item_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_item_kind" CHECK ("github_item"."kind" in ('issue', 'pr'))
);
--> statement-breakpoint
CREATE TABLE "github_repo_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"repo" text NOT NULL,
	"open_issues" integer NOT NULL,
	"open_prs" integer NOT NULL,
	"ci_state" text NOT NULL,
	"ci_sha" text NOT NULL,
	"commit_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_repo_status_ci_state" CHECK ("github_repo_status"."ci_state" in ('passing', 'failing', 'pending', 'none'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "github_item_slug_repo_number_idx" ON "github_item" USING btree ("slug","repo","number");--> statement-breakpoint
CREATE INDEX "github_item_slug_item_updated_at_idx" ON "github_item" USING btree ("slug","item_updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "github_repo_status_slug_repo_idx" ON "github_repo_status" USING btree ("slug","repo");