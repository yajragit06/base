-- Versions are immutable (rule 2): no role, including the table owner, may delete one or
-- change anything but its status. Publishing (Feature 9) defines the status transitions.
-- (TRUNCATE skips row triggers; only disposable test databases use it.)
CREATE FUNCTION versions_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'versions are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER versions_immutable
  BEFORE UPDATE OR DELETE ON "versions"
  FOR EACH ROW EXECUTE FUNCTION versions_reject_change();--> statement-breakpoint
ALTER TABLE "versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "versions_site_isolation" ON "versions"
  USING (site_id = nullif(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK (site_id = nullif(current_setting('app.site_id', true), '')::uuid);
