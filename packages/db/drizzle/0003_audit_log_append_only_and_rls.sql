-- The audit log is append-only: no role, including the table owner, may change or remove a
-- row. (TRUNCATE skips row triggers; only disposable test databases use it.)
CREATE FUNCTION audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END
$$;--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_change();--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_site_isolation" ON "audit_log"
  USING (site_id = nullif(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK (site_id = nullif(current_setting('app.site_id', true), '')::uuid);
