-- Site isolation for entries. Superusers and table owners skip row-level security, so
-- site-scoped transactions switch to this role (see withSite in src/site-scope.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cms_app') THEN
    CREATE ROLE cms_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT cms_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO cms_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cms_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cms_app;--> statement-breakpoint
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "entries_site_isolation" ON "entries"
  USING (site_id = nullif(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK (site_id = nullif(current_setting('app.site_id', true), '')::uuid);
