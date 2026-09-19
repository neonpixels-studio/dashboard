CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_provider_id_unique" UNIQUE("provider_id")
);
