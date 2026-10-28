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
