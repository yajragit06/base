CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"host" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"parent_id" uuid,
	"sort_order" integer NOT NULL,
	"slug" text NOT NULL,
	"uri" text NOT NULL,
	"path" text NOT NULL,
	"type_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_site_id_id_key" UNIQUE("site_id","id"),
	CONSTRAINT "entries_site_uri_key" UNIQUE("site_id","uri")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"default_locale" text NOT NULL,
	"locales" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_parent_fkey" FOREIGN KEY ("site_id","parent_id") REFERENCES "public"."entries"("site_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_host_key" ON "domains" USING btree ("host");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_one_primary_per_site" ON "domains" USING btree ("site_id") WHERE "domains"."is_primary";--> statement-breakpoint
CREATE INDEX "entries_site_parent_idx" ON "entries" USING btree ("site_id","parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "entries_path_idx" ON "entries" USING btree ("path" text_pattern_ops);