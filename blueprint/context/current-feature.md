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
| `time_zone` | text | a canonical IANA zone name: `Intl` must resolve it to exactly the input, and offset forms such as `+01:00` are rejected |
| `default_locale` | text | must be one of `locales` |
| `locales` | text[] | at least one; each a canonical BCP 47 tag (`Intl.getCanonicalLocales`); no duplicates |
| `created_at` | timestamptz | default now() |

**`domains`** (install-level: hosts are looked up before a site is known)

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `site_id` | uuid | references `sites`, on delete restrict |
| `host` | text | stored lowercase; hostname of at most 253 characters with optional `:port`, no scheme or path; unique across the install |
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

**Functions** (all entry functions take `siteId` and run inside `withSite`; their queries
also filter by `site_id` explicitly):

- `createSite(db, { name, timeZone, defaultLocale, locales })` returns the site.
- `addDomain(db, siteId, { host, primary? })` returns the domain.
- `listSites(db)` returns all sites ordered by name.
- `findSiteByHost(db, host)` returns the site or `null`; matching ignores case.
- `createEntry(db, siteId, { parentId?, slug, typeKey })` returns the entry, appended
  after its siblings. It locks the parent row (or, for top-level entries, the site row)
  `FOR UPDATE` while it reads the next sort order, so concurrent creates never collide.
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
