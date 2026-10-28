-- Supabase's Data API reads and writes the public schema as the anon and authenticated
-- roles (rule 14). Base's tables are reachable only through Base, so those roles get no
-- privileges here, now or on tables created later by the migrating user. On plain
-- Postgres the roles do not exist and this block does nothing.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint
-- Row-level security on the remaining tables, so a privilege granted later by mistake
-- still returns no rows. Not FORCE: the table owner (the app's connecting user) keeps
-- install-level reads such as listing sites, resolving a host and the user upsert.
ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- cms_app (withSite / withUser) sees its scoped site, or the user's member sites.
CREATE POLICY "sites_cms_app_read" ON "sites" FOR SELECT TO cms_app
  USING (
    id = nullif(current_setting('app.site_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.site_id = sites.id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );--> statement-breakpoint
-- Commands lock their site row (SELECT ... FOR NO KEY UPDATE), which needs an UPDATE
-- policy; WITH CHECK (false) keeps cms_app from changing the row.
CREATE POLICY "sites_cms_app_lock" ON "sites" FOR UPDATE TO cms_app
  USING (id = nullif(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "domains_cms_app_site" ON "domains" TO cms_app
  USING (site_id = nullif(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK (site_id = nullif(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "users_cms_app_read" ON "users" FOR SELECT TO cms_app
  USING (
    id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id
        AND m.site_id = nullif(current_setting('app.site_id', true), '')::uuid
    )
  );
