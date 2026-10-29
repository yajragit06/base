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
