# Fix: Supabase setup review follow-ups

**Type:** Fix
**Status:** verified
**Branch:** fix/supabase-setup-review-follow-ups
**Fixes:** F-34, F-35, F-36

## The problem

Three P3 findings from the Feature 7 independent review:

- **F-34 (docs).** README's Supabase section suggests `sslrootcert=certs/supabase-ca.crt`.
  `pg-connection-string` reads that path relative to the process's working directory, and
  `pnpm db:migrate` and `pnpm db:doctor` run in `packages/db` (the API in `apps/api`), so the
  documented setup fails with `ENOENT`. AGENTS.md and `.env.example` don't say the path must
  be absolute.
- **F-35 (tests).** No test would catch a regression in three checks:
  - doctor's PostgreSQL 16 `SET` role check: the existing fail test uses a role with no
    `cms_app` membership at all;
  - doctor's TRUNCATE/REFERENCES/TRIGGER clause;
  - `create-test-db`'s same-server check (F-30), which only a manual run proves.
- **F-36 (secret in output).** `create-test-db.ts` calls `new URL(...)` outside any
  try/catch. With a malformed `DATABASE_URL` or `TEST_DATABASE_URL`, Node's uncaught
  `ERR_INVALID_URL` prints the full connection string, password included.

## The fix

- **Docs:** README, AGENTS.md and `.env.example` give an absolute `sslrootcert` path, and
  say why (scripts run from each package's folder).
- **create-test-db:** move the URL checks into a small pure function in
  `packages/db/src/test-db-target.ts`. It returns the database name and the server (host
  only), or a fixed error message. It parses both URLs inside a try/catch, and its messages
  never include a URL or password. `create-test-db.ts` prints that message and exits 1. Its
  behaviour is otherwise unchanged: the same three refusals, and the same success output.
- **Doctor tests** for the two unguarded branches. No change to `doctor.ts`.

Must not break:

- `pnpm db:create-test` output and refusals;
- CI's Supabase job, which runs `db:create-test`;
- every existing test.

No new dependency.

## Build steps

- [x] 1. **Docs for the CA certificate path (F-34).** README step 2 and 3 use an absolute
  path (for example `/home/you/certs/supabase-ca.crt`) and say a relative path is read from
  each package's folder, so it breaks; AGENTS.md and `.env.example` say "absolute path".
  **Done when:** no doc in the repo suggests a relative `sslrootcert`; `pnpm lint` passes.
- [x] 2. **create-test-db never prints a URL, and its checks are tested (F-36, F-35).**
  `testDbTarget(adminUrl, testUrl)` in `src/test-db-target.ts`, used by `create-test-db.ts`.
  Unit tests cover:
  - a malformed `DATABASE_URL`, and separately a malformed `TEST_DATABASE_URL`: each gives
    the fixed "not a valid URL" message, and the message contains neither the input nor its
    password;
  - an empty database name, and the same database: "must name a separate database";
  - a different host, and a different port: "same server";
  - the same server: the name and host are returned, with no password.

  **Done when:** those tests pass. A manual `pnpm db:create-test` with a malformed URL
  holding a dummy password prints the fixed message without it and exits 1. A run with
  valid URLs still prints `Test database ... on <host>`.
- [x] 3. **Doctor regression tests (F-35).** In `doctor.test.ts`, add two cases:
  - On PostgreSQL 16+ (skipped below that, with the reason in the test name), a login role
    granted `cms_app WITH SET FALSE` fails `role`; the same role granted `WITH SET TRUE`
    passes.
  - Granting `TRUNCATE ON sites TO anon` fails `api roles` with "anon on sites".

  Both clean up their roles and grants.
  **Done when:** the new tests pass. Each fails when its branch is broken on purpose and
  restored afterwards: `'SET'` changed to `'MEMBER'`, and `TRUNCATE` removed from the
  privilege list. `pnpm verify` passes.

## Verify

- `pnpm verify` (with `TEST_DATABASE_URL`).
- `DATABASE_URL='postgres://u:SuperSecret123@[bad' pnpm db:create-test` prints the fixed
  message, without `SuperSecret123`, and exits 1.
- Read README's Supabase section: the certificate path is absolute, and the reason is
  stated.
- The hosted check for F-32 stays open; it is not part of this fix.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4190,"specSha256":"f49efcf8189e305aed5f575c818c5e18ba10e08adfa603ef390143cbf0004935","branch":"refs/heads/fix/supabase-setup-review-follow-ups","head":"a98ca5451fa35ffb95ba9c0d58853cd7f67b1708","baseRef":"refs/heads/main","baseCommit":"2693de2963f16d50f823133aabd9287c96820fb3","sourceTree":"66cc501012c64be3d9024d8a8b8cf24e2d4f7030","landing":"pull-request","absentOptional":[]} -->

## Findings

### supabase-setup-review-follow-ups/F-34 [P3] closed - README's example `sslrootcert=certs/supabase-ca.crt` is resolved from packages/db, so the documented hosted setup fails

**File:** README.md:66
**Found:** 2026-10-28 by /audit independent (scope: current; lens: quality)
**Why it matters:**
- README step 2 says to keep the CA certificate "next to the app, for example `certs/supabase-ca.crt`", and step 3 puts `sslrootcert=certs/supabase-ca.crt` in `DATABASE_URL`.
- pg-connection-string reads `sslrootcert` with `fs.readFileSync` relative to the process's working directory. `pnpm db:migrate` (turbo) and `pnpm db:doctor` (`pnpm --filter @cms/db run doctor`) run in `packages/db`, and the API runs in `apps/api`.
- A probe from the repo root with `sslrootcert=README.md`, a file that exists at the root but not in packages/db, made `pnpm db:doctor` print "Could not run the checks: ENOENT: no such file or directory, open 'README.md'", and `pnpm db:migrate` failed the same way.
- No single relative path works for both the migrations and the app, so following the README literally fails on the hosted setup. The error is clear, so this is not silent.

**Suggested fix:** Document an absolute path (for example `sslrootcert=/abs/path/supabase-ca.crt`) in README, AGENTS.md and .env.example, and say that relative paths resolve from each package's directory. Documentation only; no current requirement is lost.
**Resolution:** Fixed (fix/supabase-setup-review-follow-ups step 1): README's Supabase section uses an absolute `sslrootcert` path (`/home/you/certs/supabase-ca.crt`) and says a relative path is read from each package's folder and fails with ENOENT; AGENTS.md and `.env.example` say "absolute path". No doc in the repo outside the plans and history suggests a relative path (grep). Closed 2026-10-29 by independent review of 2693de2..a98ca54: README steps 2-3 give `/home/you/certs/supabase-ca.crt` and explain why a relative path fails; AGENTS.md and .env.example say "absolute path"; `git grep sslrootcert` at the target finds no relative example outside the findings and spec. Docs only; no new defect.

### supabase-setup-review-follow-ups/F-35 [P3] closed - No test covers doctor's PostgreSQL 16 SET check, its TRUNCATE/REFERENCES/TRIGGER clause, or create-test-db's host check

**File:** packages/db/src/doctor.test.ts:55
**Found:** 2026-10-28 by /audit independent (scope: current; lens: tests)
**Why it matters:**
- Step 6's Done-when says each finding has a test or doc change that would fail without the fix.
- The role fail test uses a login role with no cms_app membership at all, so it still fails if the `'SET'` branch is reverted to `'MEMBER'`.
- No test grants TRUNCATE, REFERENCES or TRIGGER, so dropping those from `has_table_privilege` passes the suite.
- create-test-db's host check (F-30) is proven only by a manual run.
- Probes confirm the code behaves correctly today (SET FALSE fails, SET TRUE passes; TRUNCATE, TRIGGER and column REFERENCES grants fail), so this is a regression gap, not a live defect.

**Suggested fix:** In doctor.test.ts, add a case that grants `cms_app TO <probe> WITH SET FALSE` (on PostgreSQL 16+) and expects `role` to fail, and a case that grants `TRUNCATE ON sites TO anon` and expects `api roles` to fail. Optionally, extract create-test-db's URL check into a pure function with a unit test. Test-only change; no current requirement is lost.
**Resolution:** Fixed (fix/supabase-setup-review-follow-ups steps 2-3): `testDbTarget` (src/test-db-target.ts) holds create-test-db's checks, with unit tests for malformed URLs, an empty or identical database name, a different host, a different port and the same server. doctor.test.ts adds a PostgreSQL 16+ case (cms_app WITH SET FALSE fails `role`, WITH SET TRUE passes) and a `TRUNCATE ON sites TO anon` case. Mutations confirmed: `'SET'` changed to `'MEMBER'` fails the first, removing TRUNCATE fails the second; doctor.ts restored unchanged. Closed 2026-10-29 by independent review of 2693de2..a98ca54: the new doctor cases and the 8 `testDbTarget` unit cases run and pass uncached on PostgreSQL 16.15 (not skipped). A SQL probe confirmed a `WITH SET FALSE` member has `pg_has_role(...,'SET') = f` but `'MEMBER' = t`, so the new case fails if the branch reverts to MEMBER; the TRUNCATE case expects `ok: false`, which a privilege list without TRUNCATE cannot produce. Probe roles are dropped in `finally`. No new defect.

### supabase-setup-review-follow-ups/F-36 [P3] closed - create-test-db prints the full URL, password included, when a URL is malformed

**File:** packages/db/src/create-test-db.ts:166
**Found:** 2026-10-28 by /audit independent (scope: current; lens: security)
**Why it matters:**
- `new URL(testUrl)` and `new URL(adminUrl)` run outside any try/catch.
- A malformed `TEST_DATABASE_URL` or `DATABASE_URL` crashes with Node's uncaught `ERR_INVALID_URL`. Node prints that error's `input` property, which is the full connection string including the password (confirmed by a probe with a dummy password).
- The spec's notes say never to print `DATABASE_URL` or any password. db:doctor honours that (it prints only "Invalid URL").
- The output goes only to the developer's own terminal, and CI passes valid URLs, so the exposure is small.

**Suggested fix:** Parse both URLs in a try/catch and print a fixed message such as "DATABASE_URL or TEST_DATABASE_URL is not a valid URL." without the value. No current requirement is lost.
**Resolution:** Fixed (fix/supabase-setup-review-follow-ups step 2): `testDbTarget` parses both URLs (and decodes the database names) inside try/catch and returns the fixed message "DATABASE_URL or TEST_DATABASE_URL is not a valid URL."; create-test-db prints it and exits 1. Unit tests assert the result never contains the password. Manual run with `DATABASE_URL='postgres://u:SuperSecret123@[bad/x'`: prints the fixed message, exit 1; the previous code printed the password (count 1 in its output). Closed 2026-10-29 by independent review of 2693de2..a98ca54: both URLs and the database-name decoding are parsed inside try/catch in `testDbTarget`; manual runs with a malformed `DATABASE_URL` and, separately, a malformed `TEST_DATABASE_URL` holding a dummy password printed only the fixed message (password count 0) and exited 1. Valid runs still print `Test database ... on localhost:5432` and `Created test database ...`; the host and same-database refusals are unchanged. No new defect.

## Independent review

**Status:** passed
**Target commit:** a98ca5451fa35ffb95ba9c0d58853cd7f67b1708
**Base commit:** 2693de2963f16d50f823133aabd9287c96820fb3
**Base ref:** refs/heads/main
**Spec hash:** f49efcf8189e305aed5f575c818c5e18ba10e08adfa603ef390143cbf0004935
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-29T01:35:06Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-29T01:38:03Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `pnpm verify` (with `TEST_DATABASE_URL`): pass (typecheck, lint, test, build; turbo replayed cached results)
- `TURBO_FORCE=true pnpm test`: pass, uncached (schema 39, db 78, admin 10, core 56, api 16 tests)
- `vitest run src/doctor.test.ts src/test-db-target.test.ts --reporter=verbose` in packages/db: pass, 17 tests, none skipped (PostgreSQL 16.15)
- `pnpm db:create-test` with a malformed `DATABASE_URL` holding a dummy password: pass (fixed message, exit 1, password count 0)
- `pnpm db:create-test` with a malformed `TEST_DATABASE_URL` holding a dummy password: pass (fixed message, exit 1, password count 0)
- `pnpm db:create-test` with another host, with the same database, with an existing test database, and with a new scratch database: pass (same refusals and success output; scratch database dropped)
- `psql` probe of a `cms_app WITH SET FALSE` member: `pg_has_role` SET = f, MEMBER = t (probe role dropped)
- `git grep sslrootcert` at the target: pass (no relative example outside findings and spec)

### Evidence

- HEAD, merge base from refs/heads/main and the spec hash match the request; only review.md and findings.md differ from the target; the spec is tracked, so no snapshot applies.
- Delta reviewed: .env.example, AGENTS.md, README.md, the spec, packages/db/src/create-test-db.ts, test-db-target.ts, test-db-target.test.ts and doctor.test.ts.
- `testDbTarget` parses both URLs and decodes both names inside try/catch; every message is a fixed string; the success result carries only the name and `URL.host` (no credentials).
- The SET probe shows the new PostgreSQL 16 test would fail if doctor's `'SET'` reverted to `'MEMBER'`; the TRUNCATE test expects `ok: false`, which a privilege list without TRUNCATE cannot produce.
- The TRUNCATE test creates `anon` only when missing and does not drop it, like the two existing grant tests; it revokes its grant.

### Findings

- F-34 closed, F-35 closed, F-36 closed
- No new findings

### Remaining risk

- F-32 stays `fixed` (P2): the documented verify-full setup still needs a run against a hosted Supabase project, which is out of this fix's scope and impossible here.
- The mutation runs (`'SET'` to `'MEMBER'`, TRUNCATE removed) were not repeated, because the reviewer may not edit product code; a SQL probe and the assertions stand in for them.
- The CI Supabase-image job was not run locally; `db:create-test` was exercised against local PostgreSQL 16 only.

## Try it now

Needs Postgres and `.env` as in AGENTS.md Commands.

1. `DATABASE_URL='postgres://u:SuperSecret123@[bad/x' pnpm db:create-test` prints `DATABASE_URL or TEST_DATABASE_URL is not a valid URL.`, exits 1, and never shows the password.
2. `pnpm db:create-test` with the normal `.env` still prints `Test database ... on <host>`.
3. README's "Supabase" section shows an absolute `sslrootcert` path and says why a relative one fails.
