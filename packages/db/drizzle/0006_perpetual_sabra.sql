CREATE TABLE "versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"data" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"based_on_version_id" uuid,
	"ai" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "versions_site_entry_locale_id_key" UNIQUE("site_id","entry_id","locale","id"),
	CONSTRAINT "versions_chain_key" UNIQUE NULLS NOT DISTINCT("entry_id","locale","based_on_version_id"),
	CONSTRAINT "versions_status_check" CHECK ("versions"."status" IN ('draft', 'published', 'superseded')),
	CONSTRAINT "versions_actor_type_check" CHECK ("versions"."actor_type" IN ('user', 'agent', 'system')),
	CONSTRAINT "versions_actor_id_check" CHECK ("versions"."actor_id" <> ''),
	CONSTRAINT "versions_schema_version_check" CHECK ("versions"."schema_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "created_by_type" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "created_by_id" text;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_entry_fkey" FOREIGN KEY ("site_id","entry_id") REFERENCES "public"."entries"("site_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "versions" ADD CONSTRAINT "versions_based_on_fkey" FOREIGN KEY ("site_id","entry_id","locale","based_on_version_id") REFERENCES "public"."versions"("site_id","entry_id","locale","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "versions_history_idx" ON "versions" USING btree ("site_id","entry_id","locale","created_at");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_created_by_type_check" CHECK ("entries"."created_by_type" IN ('user', 'agent', 'system'));