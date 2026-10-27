# Independent Review

**Status:** changes-requested
**Target commit:** 36060abf17e5a5a2a5772448969e184e794d2a81
**Base commit:** 9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc
**Base ref:** refs/heads/main
**Spec hash:** f39a59f25e442351f515141b429f0428d621357bc056a0563a6a52b81c0c94b4
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T08:21:37Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T08:23:57Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** changes-requested
**Check result:** not-required

## Handoff

Review the active spec and the complete `9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc..36060abf17e5a5a2a5772448969e184e794d2a81` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

## Commands

- `pnpm verify` (typecheck, lint, test, build; with TEST_DATABASE_URL and DATABASE_URL exported): pass (@cms/db 24 tests, @cms/schema 39, @cms/api 1)
- `drizzle-kit generate --dialect postgresql --schema ./src/schema.ts --out <scratch copy of drizzle/>`: pass ("No schema changes, nothing to migrate")
- `node` probe of `Intl.DateTimeFormat(...).resolvedOptions().timeZone` and `Intl.supportedValuesOf("timeZone")` (Node v22.22.0, ICU 77.1): ran; confirms F-06
- `psql` probes of `pg_timezone_names` and `AT TIME ZONE` on Postgres 16.15: ran; confirms F-06

## Evidence

- Freshness: HEAD equals Target commit; `git merge-base refs/heads/main HEAD` equals Base commit; spec SHA-256 matches; only blueprint/context/review.md differs from the target.
- Full delta reviewed: packages/db schema, both migrations and snapshots, sites.ts, entries.ts, errors.ts, site-scope.ts, index.ts, tests and test harness, tsconfig/vitest/package config, AGENTS.md.
- Site isolation: every entry query runs in `withSite` (SET LOCAL ROLE cms_app plus transaction-local app.site_id) and also filters `site_id` explicitly; RLS is enabled and forced on entries; the composite parent FK keeps parents in the same site; tests prove the cross-site read, write (42501), update (0 rows) and no-site-set (0 rows) cases.
- Sort-order concurrency: parent or site row locked `FOR NO KEY UPDATE` before `max(sort_order)`; both 10-way parallel tests return 0-9.
- Error mapping: unique violations are mapped by constraint name to `uri_taken`, `host_taken` and `primary_domain_exists`; other database errors are rethrown unchanged.
- F-06: `Asia/Kolkata` resolves to `Asia/Calcutta` in ICU and is rejected; Postgres reports "time zone "Asia/Calcutta" not recognized".
- F-02 to F-05 repairs re-examined in place and closed; F-01's original defect is gone but stays fixed pending F-06.

## Findings

- F-06 [P1] open - time zone check rejects canonical IANA names (Asia/Kolkata, Europe/Kyiv, Etc/UTC) and accepts legacy aliases Postgres does not recognize (blocking)
- F-01 [P2] fixed - offset/lowercase zones now rejected, but not closed because the repair introduced F-06
- F-02, F-03, F-04, F-05 [P3] closed
- F-07 [P3] open - host check accepts ports 0/99999 and labels over 63 characters
- F-08 [P3] open - spec still says FOR UPDATE; unused FOREIGN_KEY_VIOLATION export
- F-09 [P2] unverified - only the migrating user is granted cms_app; a separate runtime user would fail SET ROLE

## Remaining risk

- Check was not required and not run; no running app or HTTP path exists for this feature yet.
- F-09 not reproduced: tests and dev use a single database user, so a split migration/runtime user setup is unverified.
- `listChildren` is unpaginated; acceptable now, revisit when Feature 3 exposes it.
- Concurrency proven only by 10-way parallel tests on one pool, not by load testing.
- Future tenant tables get cms_app grants by default privileges but need RLS enabled explicitly in their own migrations.
