# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P2] fixed - createSite accepts offset and non-canonical time zones as IANA zones

**File:** packages/db/src/sites.ts:151
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** The spec requires `time_zone` to be a valid IANA zone. `isTimeZone` only checks that `new Intl.DateTimeFormat` does not throw, and Node 22 accepts UTC offsets (`+01:00`) and lowercase or legacy aliases (`utc`, `europe/paris`, `EST`), which are then stored unchanged. A probe against the test database stored a site with `timeZone: "+01:00"`. Postgres reads `'+01:00'` as a POSIX offset with the opposite sign (`AT TIME ZONE '+01:00'` gives 11:00 for 12:00 UTC, while Europe/Paris gives 13:00), so later scheduling or date features that pass this value to Postgres would be wrong. This is stored data, so fixing it after release needs a data migration.
**Suggested fix:** Reject offset-form zones and store the canonical name: compare `new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone` to the input (or require an IANA `Area/Location` or `UTC` form), and add `+01:00` and `europe/paris` cases to the `invalid_time_zone` test.
**Resolution:** Fixed: `isTimeZone` rejects offset forms and requires `Intl` to resolve the zone to exactly the input; `+01:00`, `-05:00`, `utc`, `europe/paris` and `EST` now return `invalid_time_zone` (sites.test.ts). Re-review 2026-10-27 (independent, claude-opus-5-5): the original defect is gone (packages/db/src/sites.ts:17-24 rejects every case above), but the exact-resolution check introduced F-06, so this finding is not closed. Close it together with F-06 once a repair is re-reviewed.

### F-02 [P3] closed - Oversized slugs and hosts raise a raw Postgres error instead of a DbError

**File:** packages/db/src/entries.ts:25
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** `SLUG` and `HOST` (packages/db/src/sites.ts:215) have no length limit. A 4000-character random slug that passes the regex fails in the btree index on `(site_id, uri)` with Postgres code 54000 (confirmed by a probe), so callers get an unexpected database error instead of `invalid_slug`. Deep trees grow `uri` and `path` the same way. Feature 3 will expose these functions to untrusted input.
**Suggested fix:** Cap slug length (and host at 253 characters plus port) in the existing checks and reject with `invalid_slug` / `invalid_host`; Feature 3's Zod command can mirror the limits.
**Resolution:** Fixed: slugs are capped at 200 characters and hostnames at 253 (`invalid_slug` / `invalid_host`); a URI or path over 2048 characters returns the new `uri_too_long` code (entries.test.ts, sites.test.ts). Closed 2026-10-27 by independent re-review: packages/db/src/entries.ts:28,30 and 146,192 enforce the slug and URI/path limits before insert, sites.ts:13,82 caps the hostname; 2048 ASCII bytes plus a uuid stays under the btree entry limit; tests at entries.test.ts:75-95 and sites.test.ts:298-305 pass under `pnpm verify`. No new defect introduced (port range gap tracked separately as F-07).

### F-03 [P3] closed - Top-level createEntry takes a full FOR UPDATE lock on the site row

**File:** packages/db/src/entries.ts:46
**Found:** 2026-10-27 by /audit independent (scope: current; lens: performance)
**Why it matters:** `FOR UPDATE` on `sites` conflicts with the `FOR KEY SHARE` lock taken by the `entries_site_id_sites_id_fk` and `domains_site_id_sites_id_fk` checks, so while one top-level create is in flight every other entry or domain insert for that site waits, not only sibling top-level creates. The parent lock at line 53 behaves the same for its children's FK checks. Impact is short waits under concurrent editing; not profiled.
**Suggested fix:** Use `.for("no key update")` for both locks; it still serializes sibling sort-order assignment without blocking unrelated FK checks. The existing concurrency tests keep proving distinct sort orders.
**Resolution:** Fixed: both sibling locks use `FOR NO KEY UPDATE`; the two 10-way concurrency tests still return sort orders 0-9. Closed 2026-10-27 by independent re-review: packages/db/src/entries.ts:50 and 57 use `.for("no key update")`; NO KEY UPDATE self-conflicts so sibling creates still serialize, and under READ COMMITTED the following `max(sort_order)` statement sees the committed sibling; both concurrency tests (entries.test.ts:140-160) pass. No new defect introduced.

### F-04 [P3] closed - RLS write test accepts any error as proof of the policy

**File:** packages/db/src/entries.test.ts:179
**Found:** 2026-10-27 by /audit independent (scope: current; lens: tests)
**Why it matters:** Step 3's done-when requires the cross-site insert to be "rejected by the policy", but the test only asserts `.rejects.toThrow()`; any failure (SQL typo, missing grant, constraint error) would pass without exercising the policy.
**Suggested fix:** Assert the Postgres cause code `42501` or the message `new row violates row-level security policy`.
**Resolution:** Fixed: the cross-site insert test asserts the Postgres cause code `42501`. Closed 2026-10-27 by independent re-review: packages/db/src/entries.test.ts:201 asserts `{ cause: { code: "42501" } }`, and the test also proves a cross-site UPDATE affects 0 rows; passes under `pnpm verify`.

### F-05 [P3] closed - @cms/db typecheck skips its test files, unlike @cms/schema

**File:** packages/db/tsconfig.json:9
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** The spec asked to exclude tests from the build, but the single `tsconfig.json` also excludes `src/**/*.test.ts` and `src/test` from `pnpm typecheck`, and Vitest does not typecheck, so type errors in tests go unnoticed. `@cms/schema` typechecks everything via `tsconfig.json` and excludes tests only in `tsconfig.build.json`. The tests type-check cleanly today (scratch tsconfig).
**Suggested fix:** Follow the `@cms/schema` pattern: no exclude in `tsconfig.json` (with `noEmit`), a `tsconfig.build.json` with the exclude and `outDir`, and `build` pointed at it.
**Resolution:** Fixed: `tsconfig.json` typechecks all of `src` (tests included) with `noEmit`; `tsconfig.build.json` excludes tests and emits `dist`. Closed 2026-10-27 by independent re-review: packages/db/tsconfig.json includes all of `src` with `noEmit`, tsconfig.build.json excludes tests, package.json `build` uses it, `pnpm typecheck` passes and `dist/` contains no test files.

### F-06 [P1] open - Time zone check rejects canonical IANA names and accepts legacy aliases Postgres does not know

**File:** packages/db/src/sites.ts:20
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** The F-01 repair requires `Intl.DateTimeFormat(...).resolvedOptions().timeZone === zone`, but ICU (Node v22.22.0, ICU 77.1) resolves many current IANA canonical names to their deprecated backward-link aliases. A probe showed `Asia/Kolkata`, `Europe/Kyiv`, `Asia/Ho_Chi_Minh`, `Asia/Kathmandu`, `Asia/Yangon`, `America/Argentina/Buenos_Aires`, `America/Nuuk`, `Pacific/Kanton` and `Etc/UTC` are all rejected with `invalid_time_zone`, while `Asia/Calcutta` and `Europe/Kiev` are accepted and stored. The project's Postgres 16.15 lists `Asia/Kolkata` and `Europe/Kyiv` in `pg_timezone_names`, and `AT TIME ZONE 'Asia/Calcutta'` / `'Europe/Kiev'` fail with "time zone not recognized". So sites in India, Ukraine, Vietnam and other countries cannot use their canonical zone, the values that are accepted break later Postgres date handling, and which names pass depends on the Node/ICU version (newer ECMA-402 engines resolve to the primary IANA name), so revalidating stored data can flip after a runtime upgrade. This contradicts the spec's "a canonical IANA zone name" contract for stored data. The "accepts canonical zone names" test (sites.test.ts:292-296) only covers names where ICU and IANA agree.
**Suggested fix:** Validate against the zone names the database will consume, not ICU's canonical form: keep the offset/sign rejection, require the `Area/Location` (or `UTC`) shape with exact case, and check membership in Postgres `pg_timezone_names` (or a vendored IANA zone list) so `Asia/Kolkata` and `Europe/Kyiv` pass and `Asia/Calcutta`, `EST`, `utc` and `+01:00` fail. Add `Asia/Kolkata`, `Europe/Kyiv` and `Etc/UTC` to the accept test and `Asia/Calcutta` to the reject cases.
**Resolution:**

### F-07 [P3] open - Host check accepts invalid ports and over-long DNS labels

**File:** packages/db/src/sites.ts:6
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security, quality)
**Why it matters:** `HOST` allows `:\d{1,5}`, so `acme.com:0` and `acme.com:99999` are stored, and labels are not limited to 63 characters, so names no resolver can serve pass as valid hosts. They can never match a real request host, and Feature 3 will expose this to user input.
**Suggested fix:** Limit each label to 63 characters in the regex (`[a-z0-9-]{0,61}`) and check the parsed port is 1-65535; add `:0`, `:65536` and a 64-character label to the malformed-host test.
**Resolution:**

### F-08 [P3] open - Small drift: spec still says FOR UPDATE; unused FOREIGN_KEY_VIOLATION export

**File:** packages/db/src/errors.ts:39
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality)
**Why it matters:** The spec's Functions section (current-feature.md:158-159) still says `createEntry` locks the parent or site row `FOR UPDATE`, while the code and Step 6 use `FOR NO KEY UPDATE`, so the spec that gets archived describes a different lock. `FOREIGN_KEY_VIOLATION` is exported but referenced nowhere.
**Suggested fix:** Update the spec sentence to `FOR NO KEY UPDATE` and either delete the constant or use it when Feature 3 maps a foreign-key error. Nothing current depends on the constant.
**Resolution:**

### F-09 [P2] unverified - Only the user that runs migrations can switch to cms_app

**File:** packages/db/drizzle/0001_entries_row_level_security.sql:10
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security)
**Why it matters:** The migration runs `GRANT cms_app TO CURRENT_USER`, the migrating user. If production connects as a separate, less-privileged runtime user (a common setup), that user is not a member of `cms_app`, so every `withSite` would fail on `SET LOCAL ROLE cms_app`. If `cms_app` already exists in the cluster and the migrating user lacks ADMIN on it, the GRANT itself could fail. Not reproduced: tests and dev use one user. AGENTS.md documents only that the database user must be able to create roles.
**Suggested fix:** Document that the app and migration users must be the same, or add a deployment step (or env-driven grant) that grants `cms_app` to the runtime user, and fail fast at startup when `pg_has_role(current_user, 'cms_app', 'MEMBER')` is false.
**Resolution:**
