# Independent Review

**Status:** passed
**Target commit:** df487e9031c2ff9fb97fc4ae47cde6774359f9f5
**Base commit:** 9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc
**Base ref:** refs/heads/main
**Spec hash:** 8dcf372e2cddd59afd88472136250054dd1ee9802482fd4fe8bab88212fbcd44
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T08:14:32Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T08:17:45Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc..df487e9031c2ff9fb97fc4ae47cde6774359f9f5` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

## Commands

- `git diff 9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc df487e9031c2ff9fb97fc4ae47cde6774359f9f5`: pass (21 files reviewed)
- `pnpm verify` (TEST_DATABASE_URL and DATABASE_URL exported): pass
- `pnpm --filter @cms/db test`: pass (2 files, 21 tests)
- `pnpm --filter @cms/db test` without TEST_DATABASE_URL: pass (fails loudly as specified)
- `drizzle-kit generate` against a scratch copy of `packages/db/drizzle`: pass (no schema drift)
- `tsc --noEmit` over `packages/db/src` including tests (scratch tsconfig): pass
- Probe script against the disposable test database: confirmed F-01 and F-02

## Evidence

- HEAD, merge base from refs/heads/main, and spec SHA-256 match the request; only review.md differs from the target.
- Every entry query filters `site_id` and runs inside `withSite` (SET LOCAL ROLE cms_app plus transaction-local `app.site_id`); RLS on entries is enabled and forced with a nullif-guarded policy.
- Composite FK `(site_id, parent_id)` keeps parents in the same site; unique violations map to `uri_taken`, `host_taken` and `primary_domain_exists` by constraint name.
- Sort order is assigned under a row lock and re-read after the wait; 10-way parallel tests for nested and top-level creates return 0-9.
- Cross-site tests cover getEntry, getEntryByUri, listChildren, a foreign parent, and raw RLS select, insert and update.

## Findings

- F-01 [P2] open: createSite accepts offset and non-canonical time zones
- F-02 [P3] open: oversized slug or host raises raw Postgres 54000
- F-03 [P3] open: top-level create locks the site row FOR UPDATE
- F-04 [P3] open: RLS insert test accepts any error
- F-05 [P3] open: @cms/db typecheck excludes test files

## Remaining risk

- Check not run (not required); no browser or runtime HTTP surface exists in this feature.
- Lock-contention impact of F-03 not profiled.
- RLS was exercised only with a superuser connection that switches to cms_app; a non-superuser production login (role membership through `GRANT cms_app TO CURRENT_USER` in the migrating role only) was not tested.
- No dependency vulnerability scan was run.
