CREATE TYPE "public"."stripe_event_kind" AS ENUM('new', 'canceled', 'payment_failed');--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"event_id" text NOT NULL,
	"kind" "stripe_event_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"email_masked" text,
	"plan_name" text NOT NULL,
	"amount_cents" integer,
	"object_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_plan_revenue" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"product_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"monthly_revenue" numeric(15, 4) NOT NULL,
	"subscribers" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_event_slug_event_id_idx" ON "stripe_event" USING btree ("slug","event_id");--> statement-breakpoint
CREATE INDEX "stripe_event_slug_occurred_at_idx" ON "stripe_event" USING btree ("slug","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_plan_revenue_slug_product_id_idx" ON "stripe_plan_revenue" USING btree ("slug","product_id");