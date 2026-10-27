# Feature: Sites and the content tree

**From build-plan:** feature 2
**Build attempt:** 1
**Branch:** feature/sites-and-the-content-tree
**Status:** verified

## Goal

Store sites (with their domains, locales and time zone) and each site's entries as a tree,
where every entry has a parent, a sort order among its siblings, a slug and a computed URI
[FR-1.1]. Site isolation is enforced by an explicit `site_id` filter in every tenant query
and backed by Postgres row-level security, as the project rules require.

## In scope

- Drizzle tables and migrations for `sites`, `domains` and `entries`.
- Row-level security on `entries`, enforced through a non-superuser role, and a
  `withSite()` transaction helper that every site-scoped query runs inside.
- Data-access functions in `@cms/db`:
  - sites: `createSite`, `addDomain`, `listSites`, `findSiteByHost`
  - entries: `createEntry`, `getEntry`, `getEntryByUri`, `listChildren`
- Integration tests against real Postgres (`TEST_DATABASE_URL`), including cross-site tests.

## Out of scope

- HTTP routes and the typed command layer with audit entries (Feature 3); sign-in and
  roles (Feature 4). These functions are internal; no write path is exposed yet, so the
  "every write is an audited command" rule is satisfied once Feature 3 wraps them.
- Entry content, versions, drafts and publishing (Features 5 and 9).
- Moving, reordering, slug changes and redirects (Feature 8); deletion and trash
  (Feature 16).
- Checking `typeKey` against registered content types (the command layer in Feature 3 or
  5 holds the registry). Here it is format-checked only.
- Site settings, AI settings and keys (Features 14, 33, 41), editing or removing sites
  and domains (Feature 14), TLS (Feature 43).
- Which entry is the home page (`/`) and resolving a request host and path to an entry
  (Feature 23). See Open questions.

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step in order, then present one feature-level review
packet with the full diff and done-when evidence. `/complete` makes the feature commit
and offers the pull request.

## Build steps

- [x] 1. **Test harness for `@cms/db`.** Add Vitest and a `test` script to `packages/db`,
  plus a helper that applies migrations to `TEST_DATABASE_URL` once per run and truncates
  every table before each test. Tests fail with a clear message when `TEST_DATABASE_URL`
  is unset.
  **Done when:** a smoke test connects and runs, `pnpm test` runs it through Turborepo,
  and it fails loudly without `TEST_DATABASE_URL`.
- [x] 2. **Sites and domains.** Tables, generated migration, `createSite`, `addDomain`,
  `listSites`, `findSiteByHost`.
  **Done when:** tests prove valid sites and domains are stored; invalid time zone,
  invalid or duplicate locales, a default locale missing from `locales`, a malformed
  host, a host already used by any site, and a second primary domain on one site are
  each rejected with the documented error code; host lookup is case-insensitive.
- [x] 3. **Entries table and row-level security.** `entries` table, a custom migration
  creating the `cms_app` role, its grants, and the RLS policy (enabled and forced), and
  `withSite()`.
  **Done when:** tests prove that inside `withSite(siteA)` a raw `SELECT * FROM entries`
  returns only site A's rows, an insert with site B's id is rejected by the policy, and
  with no site set no rows are visible; `pnpm db:generate` reports no drift.
- [x] 4. **Creating and reading entries.** `createEntry`, `getEntry`, `getEntryByUri`,
  `listChildren`.
  **Done when:** tests prove URI and path are computed for top-level and nested entries,
  new entries are appended after their siblings, children list in sort order, a duplicate
  URI returns `uri_taken`, a parent in another site returns `parent_not_found`, invalid
  slugs and type keys are rejected, and every read with site B's id finds nothing of
  site A's (cross-site tests).
- [x] 5. **Concurrency and docs.** Prove concurrent `createEntry` calls under one parent
  get distinct sort orders; add the new functions and test setup to `AGENTS.md`.
  **Done when:** a test running 10 parallel creates under one parent gets sort orders
  0-9 with no duplicates, and `pnpm verify` passes.
- [x] 6. **Repair independent-review findings F-01 to F-05.** Canonical time zones only;
  length limits on slug, host, URI and path; `FOR NO KEY UPDATE` sibling locks; the RLS
  insert test asserts the policy error (42501); `@cms/db` typecheck includes its tests
  via a separate `tsconfig.build.json`.
  **Done when:** each finding has a test or check proving the repair (`+01:00`, `utc`
  and `europe/paris` rejected; over-long slug, host and deep URI return `DbError`
  codes; concurrency tests still pass; the RLS test fails on any other error), the
  ledger marks all five `fixed`, and `pnpm verify` passes.
- [x] 7. **Repair second-review findings F-06 to F-09.** Validate time zones against the
  database's `pg_timezone_names` with an `Area/Location` or `UTC` shape; limit host labels
  to 63 characters and ports to 1-65535; align the spec's lock wording and drop the unused
  `FOREIGN_KEY_VIOLATION`; document that the app connects as the same database user that
  runs migrations (the one granted `cms_app`) and test that membership.
  **Done when:** `Asia/Kolkata`, `Europe/Kyiv`, `Etc/UTC`, `UTC` and `Europe/Paris` are
  accepted and `EST`, `utc`, `+01:00` and a name the database does not list rejected
  (whether an old alias such as `Asia/Calcutta` is listed depends on the server's tz data); `:0`, `:65536` and a
  64-character label return `invalid_host`; a test proves the migrating user is a member
  of `cms_app`; F-06 to F-09 are marked `fixed`; and `pnpm verify` passes.

## Files / areas

- `packages/db/src/schema.ts` - `sites`, `domains`, `entries`
- `packages/db/drizzle/` - generated migration plus one custom migration for the role,
  grants and RLS (`drizzle-kit generate --custom`)
- `packages/db/src/site-scope.ts` - `withSite()`
- `packages/db/src/sites.ts`, `packages/db/src/entries.ts` - data-access functions
- `packages/db/src/errors.ts` - `DbError` with a stable `code`
- `packages/db/src/index.ts` - exports
- `packages/db/src/*.test.ts`, `packages/db/src/test/setup.ts` - integration tests
- `packages/db/package.json`, `vitest.config.ts`, `tsconfig.json` (exclude tests from build)
- `AGENTS.md` - layout line and test notes

## Data / contracts

**Ids and times.** Primary keys are UUIDs generated by Postgres (`gen_random_uuid()`).
Times are `timestamptz`. Columns are snake_case; TypeScript fields camelCase.

**`sites`** (install-level, not row-level secured)

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `name` | text | non-empty, trimmed |
| `time_zone` | text | an IANA `Area/Location` name or `UTC`, exact case, that this database knows (listed in `pg_timezone_names`); offsets, aliases such as `EST` and lowercase forms are rejected |
| `default_locale` | text | must be one of `locales` |
| `locales` | text[] | at least one; each a canonical BCP 47 tag (`Intl.getCanonicalLocales`); no duplicates |
| `created_at` | timestamptz | default now() |

**`domains`** (install-level: hosts are looked up before a site is known)

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `site_id` | uuid | references `sites`, on delete restrict |
| `host` | text | stored lowercase; hostname of at most 253 characters with labels of at most 63, optional `:port` from 1 to 65535, no scheme or path; unique across the install |
| `is_primary` | boolean | default false; at most one primary per site (partial unique index) |

**`entries`** (row-level secured)

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key; `(site_id, id)` also unique |
| `site_id` | uuid | references `sites` |
| `parent_id` | uuid, nullable | `(site_id, parent_id)` references `entries (site_id, id)`, so a parent is always in the same site; on delete restrict |
| `sort_order` | integer | position among siblings, starting at 0 |
| `slug` | text | `^[a-z0-9]+(?:-[a-z0-9]+)*$` (same rule as `field.slug()`), at most 200 characters |
| `uri` | text | `/` + ancestor slugs and own slug joined by `/`, e.g. `/about/team`; unique per site; `uri` and `path` each at most 2048 characters |
| `path` | text | materialized path of ids, `/<rootId>/.../<ownId>/`; indexed for prefix search |
| `type_key` | text | content type key, `^[a-z][a-zA-Z0-9]*$` |
| `created_at` | timestamptz | default now() |

Later features add columns (publishing, scheduling, deletion); they never reshape these.

**Row-level security.** A custom migration creates the `cms_app` role (`NOLOGIN`, created
only if missing), grants it table privileges in `public` (including default privileges
for future tables), and on `entries` enables and forces RLS with one policy:
`site_id = nullif(current_setting('app.site_id', true), '')::uuid` for both `USING` and
`WITH CHECK`. `withSite(db, siteId, fn)` opens a transaction, runs
`SET LOCAL ROLE cms_app` and `set_config('app.site_id', siteId, true)`, then calls `fn`.
Superusers ignore RLS, so switching to `cms_app` is what makes the policy apply,
locally, in CI and in production. With no site set, no entry rows are visible.
The migration grants `cms_app` only to the user that runs it, so the app must connect
as that same database user; a separate runtime user is revisited in Feature 31.

**Functions** (all entry functions take `siteId` and run inside `withSite`; their queries
also filter by `site_id` explicitly):

- `createSite(db, { name, timeZone, defaultLocale, locales })` returns the site.
- `addDomain(db, siteId, { host, primary? })` returns the domain.
- `listSites(db)` returns all sites ordered by name.
- `findSiteByHost(db, host)` returns the site or `null`; matching ignores case.
- `createEntry(db, siteId, { parentId?, slug, typeKey })` returns the entry, appended
  after its siblings. It locks the parent row (or, for top-level entries, the site row)
  `FOR NO KEY UPDATE` while it reads the next sort order, so concurrent creates never collide.
- `getEntry(db, siteId, id)`, `getEntryByUri(db, siteId, uri)` return the entry or `null`.
- `listChildren(db, siteId, parentId | null)` returns children ordered by `sort_order`,
  then `id`.

**Errors.** Invalid input and conflicts throw `DbError` with a stable `code`:
`invalid_name`, `invalid_time_zone`, `invalid_locale`, `invalid_default_locale`,
`invalid_host`, `host_taken`, `primary_domain_exists`, `site_not_found`,
`invalid_slug`, `invalid_type_key`, `parent_not_found`, `uri_taken`, `uri_too_long`
(the entry's URI or path would exceed 2048 characters). Unexpected database
errors are rethrown unchanged. Feature 3's commands turn these into API errors.

## Testing

`pnpm test` exists, so every logic step ships passing tests in the same diff.

- Integration tests in `packages/db` against real Postgres via `TEST_DATABASE_URL`, never a
  mocked database. They truncate every table, so the test database must be disposable.
- Every entry read and write has a cross-site test.
- Concurrency is tested with real parallel transactions.
- CI already starts Postgres and sets `TEST_DATABASE_URL`; turbo passes it to tests.
- Final gate: `pnpm verify`.

## Notes for the AI

- Follow `blueprint/context/coding-standards.md` (Drizzle section, snake_case columns,
  forward-only migrations, every tenant query filters by `site_id`).
- Generate table migrations with `pnpm db:generate`; write the role, grants and RLS SQL
  in one `drizzle-kit generate --custom` migration. Never edit an applied migration.
- Reuse the slug and key patterns from `@cms/schema` by copying the two regexes into
  `@cms/db` (do not make `@cms/db` depend on `@cms/schema` for two constants).
- Map Postgres unique and foreign-key violations to `DbError` codes by constraint name.
- `findSiteByHost` lowercases its input; hosts are stored lowercase, so a plain equality
  index serves it.

## Open questions

Please confirm these when approving; implementation follows the choices shown.

- **RLS through a `cms_app` role.** The migration creates a cluster-level role, which
  managed Postgres hosts normally allow. The alternative is to rely on explicit `site_id`
  filters now and add RLS in Feature 31, which is weaker and harder to retrofit.
- **Home page.** With this URI scheme no entry has the URI `/`. Recommended: a site
  setting naming the home entry, decided in Feature 14 or 23. Nothing here blocks on it.
- **UUID ids** from `gen_random_uuid()` and materialized-path `path` (not `ltree`) are
  recorded choices; both become stored data in this feature.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":12743,"specSha256":"6bc45871af00d8f055b411074d87063822867d83059bc45e63756ae83cb8f1b7","branch":"refs/heads/feature/sites-and-the-content-tree","head":"9af67d2c7c2d1f4121100bb35e4dac2d060e7eb1","baseRef":"refs/heads/main","baseCommit":"9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc","sourceTree":"8c01b6336fce0173c967f44496735b674c5a2ad8","landing":"pull-request","absentOptional":[]} -->

## Findings

### 2/F-01 [P2] closed - createSite accepts offset and non-canonical time zones as IANA zones

**File:** packages/db/src/sites.ts:151
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** The spec requires `time_zone` to be a valid IANA zone. `isTimeZone` only checks that `new Intl.DateTimeFormat` does not throw, and Node 22 accepts UTC offsets (`+01:00`) and lowercase or legacy aliases (`utc`, `europe/paris`, `EST`), which are then stored unchanged. A probe against the test database stored a site with `timeZone: "+01:00"`. Postgres reads `'+01:00'` as a POSIX offset with the opposite sign (`AT TIME ZONE '+01:00'` gives 11:00 for 12:00 UTC, while Europe/Paris gives 13:00), so later scheduling or date features that pass this value to Postgres would be wrong. This is stored data, so fixing it after release needs a data migration.
**Suggested fix:** Reject offset-form zones and store the canonical name: compare `new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone` to the input (or require an IANA `Area/Location` or `UTC` form), and add `+01:00` and `europe/paris` cases to the `invalid_time_zone` test.
**Resolution:** Fixed: `isTimeZone` rejects offset forms and requires `Intl` to resolve the zone to exactly the input; `+01:00`, `-05:00`, `utc`, `europe/paris` and `EST` now return `invalid_time_zone` (sites.test.ts). Re-review 2026-10-27 (independent, claude-opus-5-5): the original defect is gone (packages/db/src/sites.ts:17-24 rejects every case above), but the exact-resolution check introduced F-06, so this finding is not closed. Close it together with F-06 once a repair is re-reviewed. Closed 2026-10-27 by independent re-review (claude-opus-5-5, target 9af67d2): packages/db/src/sites.ts:18 requires an exact-case `Area/Location` or `UTC` shape, which rules out offsets, `utc`, `europe/paris` and `EST` without consulting the database, and sites.test.ts:38-48 asserts each one returns `invalid_time_zone`; the F-06 regression it introduced is repaired and closed below.

### 2/F-02 [P3] closed - Oversized slugs and hosts raise a raw Postgres error instead of a DbError

**File:** packages/db/src/entries.ts:25
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** `SLUG` and `HOST` (packages/db/src/sites.ts:215) have no length limit. A 4000-character random slug that passes the regex fails in the btree index on `(site_id, uri)` with Postgres code 54000 (confirmed by a probe), so callers get an unexpected database error instead of `invalid_slug`. Deep trees grow `uri` and `path` the same way. Feature 3 will expose these functions to untrusted input.
**Suggested fix:** Cap slug length (and host at 253 characters plus port) in the existing checks and reject with `invalid_slug` / `invalid_host`; Feature 3's Zod command can mirror the limits.
**Resolution:** Fixed: slugs are capped at 200 characters and hostnames at 253 (`invalid_slug` / `invalid_host`); a URI or path over 2048 characters returns the new `uri_too_long` code (entries.test.ts, sites.test.ts). Closed 2026-10-27 by independent re-review: packages/db/src/entries.ts:28,30 and 146,192 enforce the slug and URI/path limits before insert, sites.ts:13,82 caps the hostname; 2048 ASCII bytes plus a uuid stays under the btree entry limit; tests at entries.test.ts:75-95 and sites.test.ts:298-305 pass under `pnpm verify`. No new defect introduced (port range gap tracked separately as F-07).

### 2/F-03 [P3] closed - Top-level createEntry takes a full FOR UPDATE lock on the site row

**File:** packages/db/src/entries.ts:46
**Found:** 2026-10-27 by /audit independent (scope: current; lens: performance)
**Why it matters:** `FOR UPDATE` on `sites` conflicts with the `FOR KEY SHARE` lock taken by the `entries_site_id_sites_id_fk` and `domains_site_id_sites_id_fk` checks, so while one top-level create is in flight every other entry or domain insert for that site waits, not only sibling top-level creates. The parent lock at line 53 behaves the same for its children's FK checks. Impact is short waits under concurrent editing; not profiled.
**Suggested fix:** Use `.for("no key update")` for both locks; it still serializes sibling sort-order assignment without blocking unrelated FK checks. The existing concurrency tests keep proving distinct sort orders.
**Resolution:** Fixed: both sibling locks use `FOR NO KEY UPDATE`; the two 10-way concurrency tests still return sort orders 0-9. Closed 2026-10-27 by independent re-review: packages/db/src/entries.ts:50 and 57 use `.for("no key update")`; NO KEY UPDATE self-conflicts so sibling creates still serialize, and under READ COMMITTED the following `max(sort_order)` statement sees the committed sibling; both concurrency tests (entries.test.ts:140-160) pass. No new defect introduced.

### 2/F-04 [P3] closed - RLS write test accepts any error as proof of the policy

**File:** packages/db/src/entries.test.ts:179
**Found:** 2026-10-27 by /audit independent (scope: current; lens: tests)
**Why it matters:** Step 3's done-when requires the cross-site insert to be "rejected by the policy", but the test only asserts `.rejects.toThrow()`; any failure (SQL typo, missing grant, constraint error) would pass without exercising the policy.
**Suggested fix:** Assert the Postgres cause code `42501` or the message `new row violates row-level security policy`.
**Resolution:** Fixed: the cross-site insert test asserts the Postgres cause code `42501`. Closed 2026-10-27 by independent re-review: packages/db/src/entries.test.ts:201 asserts `{ cause: { code: "42501" } }`, and the test also proves a cross-site UPDATE affects 0 rows; passes under `pnpm verify`.

### 2/F-05 [P3] closed - @cms/db typecheck skips its test files, unlike @cms/schema

**File:** packages/db/tsconfig.json:9
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** The spec asked to exclude tests from the build, but the single `tsconfig.json` also excludes `src/**/*.test.ts` and `src/test` from `pnpm typecheck`, and Vitest does not typecheck, so type errors in tests go unnoticed. `@cms/schema` typechecks everything via `tsconfig.json` and excludes tests only in `tsconfig.build.json`. The tests type-check cleanly today (scratch tsconfig).
**Suggested fix:** Follow the `@cms/schema` pattern: no exclude in `tsconfig.json` (with `noEmit`), a `tsconfig.build.json` with the exclude and `outDir`, and `build` pointed at it.
**Resolution:** Fixed: `tsconfig.json` typechecks all of `src` (tests included) with `noEmit`; `tsconfig.build.json` excludes tests and emits `dist`. Closed 2026-10-27 by independent re-review: packages/db/tsconfig.json includes all of `src` with `noEmit`, tsconfig.build.json excludes tests, package.json `build` uses it, `pnpm typecheck` passes and `dist/` contains no test files.

### 2/F-06 [P1] closed - Time zone check rejects canonical IANA names and accepts legacy aliases Postgres does not know

**File:** packages/db/src/sites.ts:20
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** The F-01 repair requires `Intl.DateTimeFormat(...).resolvedOptions().timeZone === zone`, but ICU (Node v22.22.0, ICU 77.1) resolves many current IANA canonical names to their deprecated backward-link aliases. A probe showed `Asia/Kolkata`, `Europe/Kyiv`, `Asia/Ho_Chi_Minh`, `Asia/Kathmandu`, `Asia/Yangon`, `America/Argentina/Buenos_Aires`, `America/Nuuk`, `Pacific/Kanton` and `Etc/UTC` are all rejected with `invalid_time_zone`, while `Asia/Calcutta` and `Europe/Kiev` are accepted and stored. The project's Postgres 16.15 lists `Asia/Kolkata` and `Europe/Kyiv` in `pg_timezone_names`, and `AT TIME ZONE 'Asia/Calcutta'` / `'Europe/Kiev'` fail with "time zone not recognized". So sites in India, Ukraine, Vietnam and other countries cannot use their canonical zone, the values that are accepted break later Postgres date handling, and which names pass depends on the Node/ICU version (newer ECMA-402 engines resolve to the primary IANA name), so revalidating stored data can flip after a runtime upgrade. This contradicts the spec's "a canonical IANA zone name" contract for stored data. The "accepts canonical zone names" test (sites.test.ts:292-296) only covers names where ICU and IANA agree.
**Suggested fix:** Validate against the zone names the database will consume, not ICU's canonical form: keep the offset/sign rejection, require the `Area/Location` (or `UTC`) shape with exact case, and check membership in Postgres `pg_timezone_names` (or a vendored IANA zone list) so `Asia/Kolkata` and `Europe/Kyiv` pass and `Asia/Calcutta`, `EST`, `utc` and `+01:00` fail. Add `Asia/Kolkata`, `Europe/Kyiv` and `Etc/UTC` to the accept test and `Asia/Calcutta` to the reject cases.
**Resolution:** Fixed: `isTimeZone` now requires an `Area/Location` or `UTC` shape in exact case and checks the name against the database's own `pg_timezone_names`, so the value is always one this Postgres understands; Node's ICU is no longer consulted. `Asia/Kolkata`, `Europe/Kyiv`, `Etc/UTC`, `UTC`, `Europe/Paris` and `Asia/Brunei` are accepted; `EST`, `utc`, `+01:00`, `posixrules` and an unknown `Mars/Olympus_Mons` are rejected (sites.test.ts). Whether an old alias such as `Asia/Calcutta` passes depends on the server's tz data (it does not on Postgres 16.15 here), so the test does not assert it. Closed 2026-10-27 by independent re-review (claude-opus-5-5, target 9af67d2): packages/db/src/sites.ts:18-26 validates shape, then exact-case membership in `pg_timezone_names` via a parameterized query; sites.test.ts:83-94 accepts all six names and :38-48 rejects the shape cases plus `Mars/Olympus_Mons`, which passes the shape regex and so proves the database lookup. The local server (Ubuntu tzdata 2026e without tzdata-legacy, the same Debian packaging the CI image's tzdata follows) lists every accepted name, and every rejection is decided by the shape regex or by a name no tz data ships, so the tests do not depend on the server's legacy aliases. The lookup costs about 10 ms per `createSite`, which is acceptable for a rare admin write. No new defect introduced; alias acceptance that varies with server tz data is the spec's documented choice and is listed as remaining risk.

### 2/F-07 [P3] closed - Host check accepts invalid ports and over-long DNS labels

**File:** packages/db/src/sites.ts:6
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security, quality)
**Why it matters:** `HOST` allows `:\d{1,5}`, so `acme.com:0` and `acme.com:99999` are stored, and labels are not limited to 63 characters, so names no resolver can serve pass as valid hosts. They can never match a real request host, and Feature 3 will expose this to user input.
**Suggested fix:** Limit each label to 63 characters in the regex (`[a-z0-9-]{0,61}`) and check the parsed port is 1-65535; add `:0`, `:65536` and a 64-character label to the malformed-host test.
**Resolution:** Fixed: host labels are limited to 63 characters in the regex and the port must be 1-65535; `acme.com:0`, `acme.com:65536` and a 64-character label return `invalid_host` (sites.test.ts). Closed 2026-10-27 by independent re-review (claude-opus-5-5, target 9af67d2): packages/db/src/sites.ts:6-7 limits labels to 63 characters and :84-91 rejects ports outside 1-65535; sites.test.ts:105-120 asserts all three cases and :96-103 keeps the 253-character limit. The original defect is gone. Leading-zero ports, a separate canonicalization gap, are tracked as F-10.

### 2/F-08 [P3] closed - Small drift: spec still says FOR UPDATE; unused FOREIGN_KEY_VIOLATION export

**File:** packages/db/src/errors.ts:39
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality)
**Why it matters:** The spec's Functions section (current-feature.md:158-159) still says `createEntry` locks the parent or site row `FOR UPDATE`, while the code and Step 6 use `FOR NO KEY UPDATE`, so the spec that gets archived describes a different lock. `FOREIGN_KEY_VIOLATION` is exported but referenced nowhere.
**Suggested fix:** Update the spec sentence to `FOR NO KEY UPDATE` and either delete the constant or use it when Feature 3 maps a foreign-key error. Nothing current depends on the constant.
**Resolution:** Fixed: the spec's Functions section now says `FOR NO KEY UPDATE`, and the unused `FOREIGN_KEY_VIOLATION` export is removed. Closed 2026-10-27 by independent re-review (claude-opus-5-5, target 9af67d2): current-feature.md:170-171 says `FOR NO KEY UPDATE`, matching entries.ts:50,57, and `FOREIGN_KEY_VIOLATION` no longer appears anywhere in packages/db/src. No new defect introduced.

### 2/F-09 [P2] closed - Only the user that runs migrations can switch to cms_app

**File:** packages/db/drizzle/0001_entries_row_level_security.sql:10
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security)
**Why it matters:** The migration runs `GRANT cms_app TO CURRENT_USER`, the migrating user. If production connects as a separate, less-privileged runtime user (a common setup), that user is not a member of `cms_app`, so every `withSite` would fail on `SET LOCAL ROLE cms_app`. If `cms_app` already exists in the cluster and the migrating user lacks ADMIN on it, the GRANT itself could fail. Not reproduced: tests and dev use one user. AGENTS.md documents only that the database user must be able to create roles.
**Suggested fix:** Document that the app and migration users must be the same, or add a deployment step (or env-driven grant) that grants `cms_app` to the runtime user, and fail fast at startup when `pg_has_role(current_user, 'cms_app', 'MEMBER')` is false.
**Resolution:** Fixed by decision: the app connects as the same database user that runs migrations, documented in AGENTS.md (Commands) and the spec; a test asserts `pg_has_role(current_user, 'cms_app', 'MEMBER')` after migrating. A separate runtime user is revisited in Feature 31. Closed 2026-10-27 by independent re-review (claude-opus-5-5, target 9af67d2): the AGENTS.md Commands section and the spec's Row-level security paragraph state the same-user requirement, and sites.test.ts:148-156 asserts membership for the user that global-setup.ts migrated with; it passes under `pnpm verify`. The documented decision removes the defect for the supported setup; a fail-fast startup check belongs to the API wiring in a later feature.

## Independent review

**Status:** passed
**Target commit:** 9af67d2c7c2d1f4121100bb35e4dac2d060e7eb1
**Base commit:** 9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc
**Base ref:** refs/heads/main
**Spec hash:** 6bc45871af00d8f055b411074d87063822867d83059bc45e63756ae83cb8f1b7
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T08:34:34Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T08:37:51Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `9f36a6bc3fae0b9fecf171057bf294dca8f1d3bc..9af67d2c7c2d1f4121100bb35e4dac2d060e7eb1` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`, `git merge-base refs/heads/main HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --short`: pass (target, merge base and spec hash match; only `blueprint/context/review.md` differs)
- `pnpm verify` (typecheck, lint, test, build; TEST_DATABASE_URL=cms_test, DATABASE_URL=cms): pass (25 `@cms/db` tests run uncached, 39 `@cms/schema`, 1 `@cms/api`; Biome checked 45 files)
- `drizzle-kit generate` against a scratch copy of `packages/db/drizzle` plus `diff -r`: pass (no schema changes, no drift)
- `psql` probes of `pg_timezone_names` (accepted names, legacy aliases, names the shape regex excludes, lookup timing): pass
- Node probe of the `HOST` regex and the time zone shape regex: pass (confirmed F-10)

### Evidence

- Site isolation: every entry function validates the site UUID, runs inside `withSite` (`SET LOCAL ROLE cms_app` plus a transaction-local `app.site_id`) and filters `entries.site_id` explicitly (packages/db/src/entries.ts:56,66,112,123,142). RLS is enabled and forced with matching USING and WITH CHECK (packages/db/drizzle/0001_entries_row_level_security.sql). Tests prove raw SELECT isolation, a 42501 policy rejection on a cross-site insert, a 0-row cross-site update, no rows with no site set, and cross-site reads return nothing (entries.test.ts:163-218).
- Migrations: 0000 is drizzle-generated and matches the schema (no drift). 0001 creates `cms_app` only if missing, grants it to the migrating user, and sets table and default privileges. Both migrations are new in this feature, so they are forward-only and safe with the previous release's code.
- Sort-order concurrency: the parent row, or the site row for top-level entries, is locked `FOR NO KEY UPDATE` before the `max(sort_order)` read. Under READ COMMITTED the next statement sees committed siblings. Two 10-way parallel tests return 0-9.
- Error mapping: unique violations map to `uri_taken`, `host_taken` and `primary_domain_exists` by constraint name through the driver error cause. Input checks raise the spec's `DbError` codes. Other errors are rethrown unchanged.
- Time zones: shape regex, then an exact-case parameterized lookup in `pg_timezone_names` (sites.ts:18-26). Rejection tests are decided by the regex or by a name no tz data ships. Every accepted test name is in the main Debian/Ubuntu tzdata package (verified locally without tzdata-legacy), so the tests do not depend on the CI server's legacy aliases.
- Hosts: labels of at most 63 characters, hostnames of at most 253, ports 1-65535; stored lowercase and looked up case-insensitively, with tests.
- Done-when coverage for steps 1-7 was traced to specific tests in sites.test.ts and entries.test.ts. The step 7 database-role membership test asserts `pg_has_role` for the migrating user.
- Ledger: F-01, F-06, F-07, F-08 and F-09 closed after re-examination; F-02 to F-05 stay closed with no regression; F-10 (P3) added.

### Findings

- F-10 [P3] open: host ports with leading zeros bypass install-wide host uniqueness (packages/db/src/sites.ts:7)
- Closed this pass: F-01, F-06, F-07, F-08, F-09. No P0 or P1 finding is open or fixed.

### Remaining risk

- Accepted time zone aliases depend on the server's tz data, as the spec accepts: a bookworm-based image with full tzdata accepts `US/Eastern` and `Asia/Calcutta`, while trixie/noble without tzdata-legacy does not. A stored alias could stop resolving after an image upgrade; revisit when Features 14 or 23 consume `time_zone`.
- Check was not required and was not run.
- The CI Postgres image (`pgvector/pgvector:pg16`) was not run locally. Its tz data was judged from Debian packaging and the local Ubuntu tzdata 2026e server.
- No dependency or vulnerability scanner is declared, so none ran.
- `listChildren` returns all children without pagination. Revisit when Feature 3 exposes it.
- No write path is exposed yet; Feature 3 must wrap these functions in audited Zod commands with permission checks (rule 4) and ship route-level forbidden-path and cross-site tests (rule 5).
