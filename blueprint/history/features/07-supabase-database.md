# Feature: Supabase database

**From build-plan:** feature 7
**Build attempt:** 1
**Branch:** feature/supabase-database
**Status:** verified

## Goal

Base's database runs on Supabase: the existing migrations, row-level security and the
`cms_app` role work on a Supabase project (local through the Supabase CLI, hosted over the
session pooler), and Supabase's auto-generated Data API can never read or write Base's
tables [NFR Security, rule 14]. This is the first step of the 2026-10-28 restructure; the
app, auth and jobs move in Features 8-10.

## In scope

- A forward-only migration that closes Base's tables to Supabase's API roles (`anon`,
  `authenticated`) wherever those roles exist, and turns on row-level security for the
  tables that do not have it yet (`sites`, `domains`, `users`), with policies for
  `cms_app` only, so the app keeps working and a later grant cannot leak data.
- Local development on the Supabase CLI: `supabase/config.toml` with `public` removed from
  the Data API's exposed schemas, and root scripts to start and stop it. (Decided during
  build: disabling the whole `api` service could also take the local gateway that
  Feature 9's Supabase Auth uses.)
- A read-only `db:doctor` check that reports, for any `DATABASE_URL`, whether migrations
  are current, the connecting user holds `cms_app`, the API roles have no privileges on
  Base's tables and every Base table has row-level security on.
- CI: a job that runs the migrations, the database tests and `db:doctor` on the official
  `supabase/postgres` image.
- Redis and the docker compose Postgres leave the default local setup (nothing uses Redis;
  plain Postgres stays supported through `DATABASE_URL`).
- Docs: `.env.example`, `AGENTS.md` and README for Supabase (session pooler URL, disabling
  the Data API on a hosted project, running `db:doctor`).

## Out of scope

- Moving the API into the Next.js app (Feature 8), Supabase Auth (Feature 9), jobs
  (Feature 10), Supabase Storage (Feature 15).
- pgvector (created by the AI features that first need it).
- Moving Base's tables out of the `public` schema.
- Creating or configuring the user's hosted Supabase project from code; the hosted check
  is `db:doctor`, run by the user (see Testing).
- Open findings F-10, F-11, F-13, F-14, F-18, F-24, F-25 and F-26 (F-15 is fixed here:
  step 5 rewrites the same `AGENTS.md` test line).

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step, then present one feature-level review packet. This
feature adds a migration and changes a security boundary, so the `when-sensitive`
independent review will be selected before `/complete`.

## Build steps

- [x] 1. **Close Base's tables to the Data API.** A custom migration that, when the role
  exists, revokes all privileges on every table, sequence and function in `public` from
  `anon` and `authenticated`, revokes the matching default privileges of the migrating
  user, and enables row-level security on `sites`, `domains` and `users` with policies
  scoped `TO cms_app` (see Data / contracts). `withSite()` and `withUser()` keep every
  existing behaviour.
  **Done when:** all existing tests pass unchanged; a new integration test builds a fresh
  database with Supabase-like `anon` and `authenticated` roles and default grants, runs the
  migrations, and proves both roles get `permission denied` on every Base table, and a
  role granted `SELECT` later still reads no rows of a row-level-secured table; tests also
  prove `cms_app` sees only its own site's `sites` and `domains` rows inside `withSite`
  and its member sites inside `withUser`; no migration drift.
- [x] 2. **`db:doctor`.** `pnpm db:doctor` (in `@cms/db`, reads `DATABASE_URL`) runs
  read-only checks and prints one line per check with pass or fail, exiting non-zero on
  any failure: pending migrations; the user is a member of `cms_app`; `anon` and
  `authenticated` (when present) hold no privilege on any Base table; every Base table has
  row-level security enabled. It never prints the URL or a password.
  **Done when:** tests run the checks against the test database (all pass) and against a
  database with a deliberately granted privilege or disabled row-level security (the
  matching check fails); a manual run prints no secret.
- [x] 3. **Supabase CLI for local development.** Pin the `supabase` CLI as a root dev
  dependency; add `supabase/config.toml` (from `supabase init`, with `public` left out of
  `[api] schemas`, seeding off, and the project id `base`); root scripts `db:start` and `db:stop`; remove Redis
  and the Postgres service from docker compose, the `infra:*` scripts, `REDIS_URL` from
  `.env.example` and CI. The local test database is created by a seed or a documented
  `createdb` step. Check the CLI's current `config.toml` keys before writing it.
  **Done when:** `pnpm install --frozen-lockfile` and `pnpm verify` pass; `.env.example`
  holds the local Supabase URL (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`)
  and a comment for the hosted session pooler URL; nothing in the repo references Redis
  outside the plans and history.
- [x] 4. **CI on the Supabase image.** A second CI job uses `supabase/postgres` (pinned
  tag, Postgres 17), connects as its `postgres` user, runs `pnpm db:migrate`, the `@cms/db`
  tests and `pnpm db:doctor`. Check the image's documented environment and whether its
  `postgres` user is a superuser, and print that in the job.
  **Done when:** the workflow is valid YAML that `pnpm lint` accepts, the job's commands
  run locally against plain Postgres, and the job passes on the pull request.
- [x] 5. **Docs and final gate.** `AGENTS.md` Commands and Layout, README commands and a
  short "Supabase" section (session pooler URL with `sslmode=require`, turn off the Data
  API in the dashboard, run `pnpm db:migrate` then `pnpm db:doctor`).
  **Done when:** `pnpm verify` passes and there is no migration drift.
- [x] 6. **Repair review findings F-27 to F-33.** A forward migration revokes the same
  privileges and defaults from `service_role` (F-27); `db:doctor` also checks
  `service_role`, column-level grants, TRUNCATE/REFERENCES/TRIGGER, and that the user can
  `SET ROLE cms_app` (F-28), and prints the underlying connection error (F-29);
  `create-test-db` refuses when the two URLs name different servers (F-30); README says
  Base needs its own Supabase project and that 0008 closes all of `public` (F-31), and
  documents certificate verification with Supabase's CA certificate instead of a bare
  `sslmode=require` (F-32, still to be confirmed on a hosted project); and the tests cover
  the default-privilege revoke, cross-site domain inserts, the users policy, the lock
  policy, doctor's `migrations` and `role` failures, and skip without `CREATEDB` (F-33).
  **Done when:** each finding has a test or doc change that would fail or read wrong
  without the fix; F-27 to F-31 and F-33 are marked `fixed`, F-32 `fixed` (docs) with its
  hosted check still open; the Supabase CI job passes; and `pnpm verify` passes.

## Files / areas

- `packages/db/drizzle/` - the new custom migration (`drizzle-kit generate --custom`)
- `packages/db/src/doctor.ts` (new), `src/doctor.test.ts`, `src/supabase.test.ts` (new),
  `packages/db/package.json` (`doctor` script)
- `packages/db/src/sites.ts`, `users.ts` - only if a query needs an explicit filter for the
  new policies
- `supabase/config.toml` (new), root `package.json`, `pnpm-lock.yaml`
- `docker-compose.yml`, `infra/postgres/init.sql` (removed or reduced), `.env.example`
- `.github/workflows/ci.yml`
- `AGENTS.md`, `README.md`

## Data / contracts

**Migration (custom, forward-only).** Wrapped so it is a no-op for roles that do not exist
(plain Postgres has no `anon` or `authenticated`):

- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`, the same for
  sequences and functions, and `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON
  TABLES / SEQUENCES / FUNCTIONS FROM anon, authenticated` for the migrating user.
- `ALTER TABLE sites, domains, users ENABLE ROW LEVEL SECURITY` (not `FORCE`: the owner,
  which is the app's connecting user, keeps install-level reads such as `listSites`,
  `findSiteByHost` and the user upsert).
- Policies, all `TO cms_app`:
  - `sites`: visible when `id = app.site_id`, or when the row is one of `app.user_id`'s
    member sites (an `EXISTS` on `memberships`, itself row-level secured); no insert,
    update or delete for `cms_app` beyond what `withSite` already needs (`SELECT ... FOR
    NO KEY UPDATE` locks only).
  - `domains`: `site_id = app.site_id` for every command (`site.addDomain` inserts its
    domain inside `withSite`, so select-only would break it; decided during build).
  - `users`: select only, `id = app.user_id`, or a member of `app.site_id`.
- Existing policies on `entries`, `versions`, `audit_log` and `memberships` are unchanged.

**`db:doctor` output** (one line per check, no secrets):

```text
ok   migrations: 9 of 9 applied
ok   role: connecting user is a member of cms_app
ok   api roles: anon and authenticated hold no privileges on Base tables
fail row-level security: disabled on domains
```

Exit code 0 when every check is `ok`, 1 otherwise. "Base tables" means the tables in
`public` created by Base's migrations (read from the Drizzle schema), not Supabase's own.

**Connection.** `DATABASE_URL` is the Supabase session pooler (port 5432, IPv4) or direct
connection URL, with `sslmode=require` for hosted projects. The transaction pooler (port
6543) is not supported for migrations. Migrations and the app connect as the same user,
as today (the `postgres` user on Supabase).

**Env vars:** `REDIS_URL` removed. `DATABASE_URL` and `TEST_DATABASE_URL` unchanged in
name.

## Testing

`pnpm test` exists, so every logic step ships passing tests.

- `@cms/db` integration tests against real Postgres for the migration's effect, with
  Supabase-like roles created in a fresh, disposable database (the test drops it after).
- `db:doctor` checks tested for pass and fail cases.
- CI proves the migrations and database tests on the `supabase/postgres` image.
- Not automated: `supabase start` (this environment has no Docker daemon) and a hosted
  project. The user runs `pnpm db:migrate` and `pnpm db:doctor` against their project;
  record this as remaining risk until that output is pasted back.
- Final gate: `pnpm verify`. Last run on this code (main at 585a6d8, the same code as the
  reviewed ae74322): pass (175 tests).

## Notes for the AI

- Migrations are forward-only and must work with the previous release's code (rule 11):
  the new policies must not change what the current API returns.
- Never print `DATABASE_URL` or any password, in `db:doctor`, tests or CI logs.
- Keep `cms_app` the only role the app switches to; do not grant anything to `anon`,
  `authenticated` or `service_role`.
- The test that creates a database needs `CREATEDB`; check the test user has it (CI's
  `cms` user is a superuser) and skip with a clear message otherwise.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":11122,"specSha256":"c9f9a81e9ef8a731620fc48c012576af1302df38216e0cc6df32077ff4a2acf8","branch":"refs/heads/feature/supabase-database","head":"4b1bcf18c207f23ce6597476b17d9ad68aa8410e","baseRef":"refs/heads/main","baseCommit":"585a6d8a1039f519c7bea8c805b3cfc89be3b2df","sourceTree":"9465ed3e0f5662ee53c5fb0758d8cf2a2048f09b","landing":"pull-request","absentOptional":[]} -->

## Findings

### 07/F-15 [P3] closed - AGENTS.md test command omits that `@cms/api` tests now need TEST_DATABASE_URL

**File:** AGENTS.md:387
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality)
**Why it matters:** The spec's Testing section says `apps/api` tests "now need `TEST_DATABASE_URL` like the other packages", and `apps/api/vitest.config.ts` throws without it. The Commands section still says only "`@cms/db` and `@cms/core` tests need `TEST_DATABASE_URL`", so the documented setup is incomplete for anyone running the API tests alone.
**Suggested fix:** Change the line to "`@cms/db`, `@cms/core` and `@cms/api` tests need `TEST_DATABASE_URL` exported". Documentation only; no current requirement is lost.
**Resolution:** Fixed (Feature 7 step 5): the AGENTS.md test command now reads "`@cms/db`, `@cms/core` and `@cms/api` tests need `TEST_DATABASE_URL` exported", and adds `pnpm db:create-test` and the need to create databases. Closed 2026-10-28 by independent review of 585a6d8..8e13d4c: AGENTS.md Commands lists all three packages, matching `apps/api/vitest.config.ts:3`, and the edit introduced no new defect.

### 07/F-27 [P3] closed - Migration 0008 and db:doctor leave `service_role` with full, RLS-bypassing access to Base tables

**File:** packages/db/drizzle/0008_close_tables_to_supabase_api.sql:9
**Found:** 2026-10-28 by /audit independent (scope: current; lens: security)
**Why it matters:**
- The migration revokes privileges only from `anon` and `authenticated`, and `db:doctor` checks only those roles (doctor.ts:14).
- On Supabase, `service_role` gets default grants on new `public` tables. The repo's own `supabase/config.toml:21-24` comment says so. `service_role` also has BYPASSRLS.
- On a hosted project whose Data API is still on, any holder of the service-role key can therefore read and write every Base table through REST, bypassing row-level security. That key is the `SUPABASE_SERVICE_ROLE_KEY` the app will hold from Feature 9. The same may hold locally through `/graphql/v1`, because `extra_search_path` still includes `public` (unverified).
- Rule 14 says the Data API never exposes Base's tables. Today that holds only if the user turned off the Data API by hand, which nothing verifies.
- It is P3 because the key is server-only by rule 14 and the spec scoped the revoke to `anon` and `authenticated`.

**Suggested fix:** In a new forward migration, revoke the same table, sequence and function privileges and defaults from `service_role` (Base never uses it for its tables). Add `service_role` to doctor's API-role check. No current requirement is lost.
**Resolution:** Fixed (Feature 7 step 6): migration 0009 revokes all table, sequence and function privileges and the matching defaults from `service_role` when it exists; `db:doctor` checks `service_role` with the other API roles. supabase.test.ts creates `service_role` with Supabase-like default grants and proves it holds no privilege on any Base table or on a table created after the migrations. Closed 2026-10-28 by independent review of 585a6d8..4b1bcf1: a scratch database with Supabase-like defaults kept no table, sequence or column privilege and no `pg_default_acl` entry for service_role after 0008+0009; doctor flags a TRUNCATE grant to service_role; no new defect.

### 07/F-28 [P3] closed - db:doctor's privilege check misses column grants and other table privileges

**File:** packages/db/src/doctor.ts:71
**Found:** 2026-10-28 by /audit independent (scope: current; lens: security)
**Why it matters:**
- The "api roles" check tests only table-level SELECT, INSERT, UPDATE and DELETE with `has_table_privilege`. A probe granted `SELECT (email) ON users TO anon`, and doctor still reported `ok ... hold no privileges on Base tables`.
- TRUNCATE, REFERENCES and TRIGGER grants are also ignored.
- The role check uses `pg_has_role(..., 'MEMBER')`. On PostgreSQL 16+ that is true even for a grant with SET FALSE, which `SET LOCAL ROLE cms_app` in `withSite` needs.
- Row-level security still hides the rows today, so this is a weaker check than its message claims, not a live leak.

**Suggested fix:**
- Also fail on `has_any_column_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')`.
- Fail on `has_table_privilege` with TRUNCATE, REFERENCES and TRIGGER.
- On PostgreSQL 16+, check `pg_has_role(current_user, 'cms_app', 'SET')`.
- Add a column-grant fail test.

No current requirement is lost.
**Resolution:** Fixed (Feature 7 step 6): the API-role check now fails on any table privilege (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) or any column privilege (`has_any_column_privilege`); the role check requires `pg_has_role(..., 'SET')` on PostgreSQL 16+ (MEMBER before). doctor.test.ts adds a column-grant fail case (`SELECT (email) ON users TO anon`) and a fail case for a login role that cannot switch to `cms_app`. Closed 2026-10-28 by independent review of 585a6d8..4b1bcf1: probes confirm doctor fails for TRUNCATE (service_role), TRIGGER (authenticated), column REFERENCES (anon), and a role granted cms_app WITH SET FALSE, and passes with SET TRUE; with cms_app absent the query short-circuits to false instead of raising. The missing regression tests for the SET and extra-privilege branches are tracked separately as F-35.

### 07/F-29 [P3] closed - db:doctor hides why it could not connect

**File:** packages/db/src/doctor-cli.ts:18
**Found:** 2026-10-28 by /audit independent (scope: current; lens: quality)
**Why it matters:** Drizzle wraps connection errors, so `(error as Error).message` is "Failed query: SELECT CASE WHEN to_regclass(...) ... params:". Runs with a wrong password and with an unknown host printed only that text. The useful reason, such as "password authentication failed for user ..." or "getaddrinfo ENOTFOUND ...", is in `error.cause` and is never shown. The cause holds no secret. A user checking a hosted project gets no hint of what to fix, and the comment ("can include the host") describes output that never appears.
**Suggested fix:** Print `error.cause?.message ?? error.message`, without the query text. Optionally add a test that a failed connection prints the cause and no password. No current requirement is lost.
**Resolution:** Fixed (Feature 7 step 6): doctor-cli prints the driver error (`error.cause.message`) instead of Drizzle's query text. Manual runs print "password authentication failed for user \"cms\"" and "getaddrinfo ENOTFOUND nonexistent.invalid", with no password or URL. Closed 2026-10-28 by independent review of 585a6d8..4b1bcf1: reruns with a wrong password, a refused port, an unknown host, a malformed URL and a missing sslrootcert each print the driver reason with no password or URL and exit 1; a connection failure swallowed by migrationsCheck's catch is still reported through the role query.

### 07/F-30 [P3] closed - create-test-db creates the database on DATABASE_URL's server even when TEST_DATABASE_URL names another

**File:** packages/db/src/create-test-db.ts:11
**Found:** 2026-10-28 by /audit independent (scope: current; lens: quality, security)
**Why it matters:**
- The script takes only the database name from `TEST_DATABASE_URL` and runs `CREATE DATABASE` on `DATABASE_URL`'s server, as that server's user.
- If `.env` points `DATABASE_URL` at a hosted project while `TEST_DATABASE_URL` stays local (or the reverse), it creates a stray empty database on the hosted server and reports success. The tests then fail against a database that does not exist.
- It never drops or truncates anything, so no data is at risk.

**Suggested fix:** Refuse unless both URLs share host and port (compare `new URL(...).host`), and print which server it used (host only). No current requirement is lost.
**Resolution:** Fixed (Feature 7 step 6): create-test-db refuses unless `DATABASE_URL` and `TEST_DATABASE_URL` name the same host and port, and reports the server (host only) it used. Manual run with different hosts exits 1 with "DATABASE_URL and TEST_DATABASE_URL must point at the same server." Closed 2026-10-28 by independent review of 585a6d8..4b1bcf1: probes confirm the refusal for different hosts (and, conservatively, for an implicit versus explicit port) and success with "on localhost:5432" for the same server. The malformed-URL echo (F-36) predates this repair.

### 07/F-31 [P3] closed - Migration 0008 also closes non-Base objects in `public`, and the docs do not say so

**File:** packages/db/drizzle/0008_close_tables_to_supabase_api.sql:11
**Found:** 2026-10-28 by /audit independent (scope: current; lens: quality)
**Why it matters:**
- `REVOKE ALL ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA public` and the default-privilege revokes apply to everything in `public`, not only Base's tables.
- A probe confirmed it: a pre-existing non-Base table with an explicit `GRANT SELECT ... TO anon` lost that grant.
- Tables the migrating user creates later, for example `postgres` in the Table Editor, are no longer reachable by the API roles either.
- This is what the spec asks for, but README's Supabase section ("Base also revokes the API roles' access") reads as Base-only. Someone pointing Base at an existing project would silently break their other Data API clients.

**Suggested fix:** In README's Supabase section, say that Base expects its own Supabase project and that the migration revokes the API roles' access to everything in `public`, including future objects created by the migrating user. Documentation only; no current requirement is lost.
**Resolution:** Fixed (Feature 7 step 6): README's Supabase section says to give Base its own Supabase project, because the migrations take the Data API roles' access to everything in `public`, including tables created there later; AGENTS.md says the same. Closed 2026-10-28 by independent review of 585a6d8..4b1bcf1: README "Supabase" and AGENTS.md Commands and Layout state this accurately for 0008 and 0009 (anon, authenticated, service_role), matching the migrations' schema-wide REVOKE and default-privilege revokes.

### 07/F-33 [P3] closed - Several new policy branches and doctor failure paths have no test

**File:** packages/db/src/supabase.test.ts:142
**Found:** 2026-10-28 by /audit independent (scope: current; lens: tests)
**Why it matters:**
- Probes confirmed each of these behaves correctly today, but a regression would pass the suite:
  - **Default privileges.** Nothing tests the `ALTER DEFAULT PRIVILEGES` half of 0008. Removing it still passes, because 0008's REVOKE ALL also strips grants from the tables created in earlier migrations.
  - **Domains WITH CHECK.** A cross-site domain insert inside `withSite` is not tested.
  - **Users policy.** The `users_cms_app_read` site branch (member versus non-member inside `withSite`) is not tested.
  - **Lock policy.** The lock policy not covering another site's row is not tested.
  - **Doctor.** The `migrations` and `role` fail paths are not tested.
- The tests also leave cluster-wide `anon` and `authenticated` roles, granted to the test user, on the developer's server.
- The spec's note says to skip with a clear message when the user lacks CREATEDB, but `supabase.test.ts` fails instead.

**Suggested fix:**
- In `supabase.test.ts`, create a table after `runMigrations` and assert the API roles hold no privilege on it.
- Assert that a cross-site domain insert is rejected.
- Assert that `withSite` sees member users only and that a lock on another site returns no row.
- Add doctor fail cases for a missing migration row and missing `cms_app` membership.
- Skip with a message when `rolcreatedb` is false.

Test-only change; no current requirement is lost.
**Resolution:** Fixed (Feature 7 step 6): supabase.test.ts adds a table created after the migrations (no API-role privilege), a rejected cross-site domain insert, the lock policy (own site 1 row, other site 0), and `withSite` seeing member users only; doctor.test.ts adds fail cases for missing migration history and a user who cannot switch to `cms_app`; the Supabase-like tests skip with a warning without CREATEDB and CREATEROLE and revoke the API roles from the test user afterwards. Writing these tests also found and fixed a doctor crash: the migrations check now reports `fail` instead of throwing when the history table is missing or unreadable. Closed 2026-10-28 by independent review of 585a6d8..4b1bcf1: each added test targets the branch it names. The `later_table` case would fail without the default-privilege revokes in 0008 and 0009, since the simulated defaults would grant SELECT. The cross-site insert and lock cases exercise the domains WITH CHECK and `sites_cms_app_lock` USING. The users case exercises the `users_cms_app_read` site branch. The doctor `migrations` case renames the history table and the `role` case uses a login role with no membership, and both are restored in finally blocks. The CREATEDB/CREATEROLE skip is in place. A `pg_auth_members` comparison before and after the suite was unchanged, and no probe roles or `base_supabase_*` databases were left. The cluster-wide API roles staying on a plain Postgres server is documented in the test and harmless. No new defect.

## Independent review

**Status:** passed
**Target commit:** 4b1bcf18c207f23ce6597476b17d9ad68aa8410e
**Base commit:** 585a6d8a1039f519c7bea8c805b3cfc89be3b2df
**Base ref:** refs/heads/main
**Spec hash:** c9f9a81e9ef8a731620fc48c012576af1302df38216e0cc6df32077ff4a2acf8
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-28T12:19:39Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-28T12:26:47Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `585a6d8a1039f519c7bea8c805b3cfc89be3b2df..4b1bcf18c207f23ce6597476b17d9ad68aa8410e` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`, `git merge-base refs/heads/main HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain --untracked-files=all`: pass. HEAD, merge base and spec hash match the request; only review.md and findings.md differ.
- `pnpm verify` (TEST_DATABASE_URL=postgres://cms:cms@localhost:5432/cms_test, PostgreSQL 16.15): pass. Biome checked 113 files. Tests ran uncached: db 68, schema 39, admin 10, core 56, api 16 (189 total). Typecheck and build were replayed from cache.
- `pnpm turbo run typecheck build --force`: pass (10 of 10 tasks, 0 cached).
- `pnpm --filter @cms/db generate`: pass ("No schema changes, nothing to migrate"; nothing written).
- `gh api repos/yajragit06/base/commits/4b1bcf1.../check-runs`: pass. "Migrate and test on Supabase Postgres" and "Typecheck, lint, migrate, test, build" both succeeded on the target SHA.
- `gh api .../actions/jobs/122811452015/logs`: unavailable (blob storage returned 403).
- tsx probe in /tmp on scratch database `tmp_supa_probe` with Supabase-like `anon`, `authenticated` and `service_role` default grants, then runMigrations and runDoctor; plus a `tmp_doctor_set` role granted cms_app WITH SET FALSE, then SET TRUE: pass. Both were dropped afterwards.
- `node --import tsx src/doctor-cli.ts` with a wrong password, a refused port, an unknown host, a malformed URL and a missing sslrootcert: pass (driver reason printed, no password or URL, exit 1).
- `pnpm db:doctor` and `pnpm db:migrate` from the repo root with `sslrootcert=README.md`: fail with ENOENT. A relative path resolves from packages/db (F-34).
- `node --import tsx src/create-test-db.ts` with different hosts, implicit and explicit port, the same server, and a malformed URL: the host check passes; a malformed URL echoes the password (F-36).
- psql comparison of `pg_auth_members` before and after the test suite and the probes: pass (unchanged; no leftover `doctor_probe_*`, `tmp_*` or `base_supabase_*` objects).

### Evidence

- Migrations 0008 and 0009 together, on a Supabase-like database: no table, sequence or column privilege remains for anon, authenticated or service_role. Their `pg_default_acl` entries are gone; only `cms_app=arwd/cms` remains. RLS is on for all 7 Base tables. runDoctor reports four `ok` lines (10 of 10 migrations).
- The public functions are only the trigger functions `audit_log_reject_change` and `versions_reject_change` (not SECURITY DEFINER, and not callable directly).
- doctor.ts:76-80: when cms_app is missing, the `EXISTS ... AND pg_has_role(...)` target-list expression short-circuits to false instead of raising. The PostgreSQL 16 `SET` branch fails for WITH SET FALSE and passes for SET TRUE.
- doctor.ts:98-99 fails on TRUNCATE (service_role), TRIGGER (authenticated) and column REFERENCES (anon). The column-grant test covers SELECT (email).
- doctor-cli.ts:150-151 prints, for example, `password authentication failed for user "cms"`, `connect ECONNREFUSED 127.0.0.1:5999`, `getaddrinfo ENOTFOUND nonexistent.invalid` and `Invalid URL`. No secret appears.
- When the first query fails to connect, migrationsCheck's catch swallows the error, but the role query rethrows it, so the CLI still reports the real cause.
- create-test-db.ts:172-176 refuses mismatched hosts. `localhost` versus `localhost:5432` also refuses, which is the safe direction.
- Policies: both EXISTS subqueries use `memberships_pkey (site_id, user_id)`. No code updates or deletes sites, domains or users as cms_app, so `sites_cms_app_lock`'s `WITH CHECK (false)` breaks nothing. Previous-release compatibility (rule 11) holds: all core and api tests pass unchanged.
- supabase.test.ts proves: no privilege on any Base table; a table created after the migrations stays closed (exercises the default-privilege revokes); SET ROLE gets permission denied; a later mistaken SELECT grant still returns 0 rows; cms_app sees only its own site and domains, cannot insert another site's domain, locks 1 own row and 0 others, sees member users only, and inside withUser sees member sites.
- Tests skip with a warning when the user lacks CREATEDB and CREATEROLE.
- Spec Done-when items 1-5 are met. Step 6 is met except tests for F-28's SET and TRUNCATE/REFERENCES/TRIGGER branches and F-30's host check (F-35).
- F-32 approach: the installed pg-connection-string reads `sslrootcert` into `ssl.ca` with verify-full. That matches Supabase's dashboard CA certificate download and is sound in principle. The README's example path does not work as written (F-34).

### Findings

- Closed: F-27, F-28, F-29, F-30, F-31, F-33.
- Kept fixed: F-32 [P2] (documentation approach sound; hosted check still impossible here).
- New: F-34 [P3] open, F-35 [P3] open, F-36 [P3] open.
- No P0 or P1 finding is open or fixed. Older open entries (F-10, F-11, F-13, F-14, F-18, F-24, F-25, F-26) were not in scope and are unchanged.

### Remaining risk

- Hosted Supabase was not tested. Not yet verified: `pnpm db:migrate` and `pnpm db:doctor` over the session pooler with verify-full and sslrootcert, the pooler certificate chaining to Supabase's CA, and the Data API being off.
- The Supabase CI job log was unavailable (403). Only its success conclusion was seen, not the printed role attributes or doctor output.
- `supabase start` and local Supabase CLI behaviour were not run (no Docker daemon).
- `pnpm install --frozen-lockfile` was not run locally (it would modify the install). Evidence is CI's install on the target SHA.
- CI proves the default-privilege revoke only against defaults the test simulates in a fresh database, not the image's real `postgres` database defaults. A later table on a real Supabase project was not checked.
- supabase.test.ts leaves cluster-wide `anon`, `authenticated` and `service_role` roles on a plain Postgres server (their membership in the test user is revoked).
- If the process crashes between doctor.test.ts's rename and its restore, `drizzle.__drizzle_migrations` stays renamed in the disposable test database.

## Try it now

Needs Postgres with migrations applied (`pnpm db:migrate`) and `DATABASE_URL` in `.env`; the Supabase-image job in CI runs the same steps.

1. `pnpm db:doctor` prints four `ok` lines (migrations, role, api roles, row-level security) and exits 0.
2. As a superuser in `psql`, run `GRANT SELECT ON sites TO PUBLIC;` (or to `anon` on Supabase), then `pnpm db:doctor` again: the `api roles` line fails and the exit code is 1. Undo it with `REVOKE SELECT ON sites FROM PUBLIC;`.
3. Set `DATABASE_URL` with a wrong password and run `pnpm db:doctor`: it prints `password authentication failed for user ...`, with no URL or password.
4. On a hosted Supabase project (its own project), use the session pooler URL with `sslmode=verify-full&sslrootcert=<absolute path to the CA certificate>`, then run `pnpm db:migrate` and `pnpm db:doctor`. This is the hosted check that F-32 still waits on.
