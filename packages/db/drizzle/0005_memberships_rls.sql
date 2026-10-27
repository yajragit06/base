-- Memberships are site data: a site-scoped transaction sees and writes only its site's rows.
-- A second, read-only policy lets a transaction scoped to a user (app.user_id) list that
-- user's own memberships across sites, which "who am I" needs.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_site_isolation" ON "memberships"
  USING (site_id = nullif(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK (site_id = nullif(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "memberships_own_rows" ON "memberships" FOR SELECT
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
