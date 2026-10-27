# Independent Review

**Status:** passed
**Target commit:** 95b13f5e62aa19a4f31e2fbe6d3e4c33753a15b2
**Base commit:** b63356eebd0b45ff987543b753a31620836bcb1e
**Base ref:** refs/heads/main
**Spec hash:** 1c11c0303ae44169ad83f9b4faff2b8863a2981ee8ea2322dcaa248d66188e7b
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T08:53:46Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T08:56:42Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Commands

- `git merge-base refs/heads/main HEAD`: pass (equals Base commit; HEAD equals Target commit)
- `sha256sum blueprint/context/current-feature.md`: pass (matches Spec hash; spec is tracked)
- `git status --porcelain`: pass (only blueprint/context/review.md differs)
- `pnpm verify` (TEST_DATABASE_URL and DATABASE_URL exported): pass (typecheck, lint, build; tests @cms/db 30, @cms/schema 39, @cms/api 1, @cms/core 14)
- `pnpm db:generate` in a throwaway scratch copy of the checkout: pass (no schema changes; no drift)

## Evidence

- packages/core/src/command.ts: input parse and authorize run before any transaction; handler and insertAudit share one transaction (withSite for site-scoped commands, db.transaction plus transaction-local app.site_id for install-level ones); DbError maps to CommandError with the same code; other errors propagate unchanged.
- packages/db/drizzle/0003_audit_log_append_only_and_rls.sql: ENABLE and FORCE row-level security with the same app.site_id policy as entries (USING and WITH CHECK); a BEFORE UPDATE OR DELETE row trigger raises on every change.
- packages/db/src/audit.test.ts: proves insert inside withSite, rejection of another site's row (42501), invisibility of other sites' rows, the actor check constraints, and UPDATE and DELETE refused for the table owner. The local `cms` role is not a superuser, so forced row-level security was exercised.
- packages/core/src/command.test.ts: proves invalid input never reaches the handler, a denying authorizer never reaches the handler, commit together, rollback of the entry and audit row on a forced post-write failure, and rollback when no audit site is returned.
- packages/core/src/commands/commands.test.ts: proves DbError codes pass through (invalid_time_zone, host_taken, parent_not_found, uri_taken), and that a cross-site parent fails with no audit row in either site.
- The actor is a separate trusted parameter; command inputs are z.strictObject; audit diffs come from returned database rows; no secrets exist in any audited row.
- The migration only adds a table, so it is compatible with the previous release; CI runs test suites at --concurrency=1.

## Findings

- F-11 [P3] open: addDomain and entry.create command tests do not fully assert exactly one audit row with actor and diff
- F-10 [P3] open: carried forward from feature 2, out of scope, unchanged by this delta

## Remaining risk

- Append-only enforcement is a row trigger: the table owner can still TRUNCATE (relied on by tests) or drop the trigger; cms_app keeps UPDATE and DELETE grants on audit_log via default privileges (blocked by the trigger, not revoked).
- For install-level commands, the audit row's site comes from the handler's return value; handlers are trusted code, and the site.create test checks it.
- The reviewer did not migrate a fresh empty database (CI does); migrations were applied to the existing test database by the test global setup.
- CI connects as a superuser, which bypasses row-level security on the install-level path; local runs as a non-superuser owner exercised it.
- Check (`/check`) was not run because the request did not require it; no HTTP route exposes commands yet.
