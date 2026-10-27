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
**Resolution:** Fixed: `isTimeZone` rejects offset forms and requires `Intl` to resolve the zone to exactly the input; `+01:00`, `-05:00`, `utc`, `europe/paris` and `EST` now return `invalid_time_zone` (sites.test.ts).

### F-02 [P3] fixed - Oversized slugs and hosts raise a raw Postgres error instead of a DbError

**File:** packages/db/src/entries.ts:25
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** `SLUG` and `HOST` (packages/db/src/sites.ts:215) have no length limit. A 4000-character random slug that passes the regex fails in the btree index on `(site_id, uri)` with Postgres code 54000 (confirmed by a probe), so callers get an unexpected database error instead of `invalid_slug`. Deep trees grow `uri` and `path` the same way. Feature 3 will expose these functions to untrusted input.
**Suggested fix:** Cap slug length (and host at 253 characters plus port) in the existing checks and reject with `invalid_slug` / `invalid_host`; Feature 3's Zod command can mirror the limits.
**Resolution:** Fixed: slugs are capped at 200 characters and hostnames at 253 (`invalid_slug` / `invalid_host`); a URI or path over 2048 characters returns the new `uri_too_long` code (entries.test.ts, sites.test.ts).

### F-03 [P3] fixed - Top-level createEntry takes a full FOR UPDATE lock on the site row

**File:** packages/db/src/entries.ts:46
**Found:** 2026-10-27 by /audit independent (scope: current; lens: performance)
**Why it matters:** `FOR UPDATE` on `sites` conflicts with the `FOR KEY SHARE` lock taken by the `entries_site_id_sites_id_fk` and `domains_site_id_sites_id_fk` checks, so while one top-level create is in flight every other entry or domain insert for that site waits, not only sibling top-level creates. The parent lock at line 53 behaves the same for its children's FK checks. Impact is short waits under concurrent editing; not profiled.
**Suggested fix:** Use `.for("no key update")` for both locks; it still serializes sibling sort-order assignment without blocking unrelated FK checks. The existing concurrency tests keep proving distinct sort orders.
**Resolution:** Fixed: both sibling locks use `FOR NO KEY UPDATE`; the two 10-way concurrency tests still return sort orders 0-9.

### F-04 [P3] fixed - RLS write test accepts any error as proof of the policy

**File:** packages/db/src/entries.test.ts:179
**Found:** 2026-10-27 by /audit independent (scope: current; lens: tests)
**Why it matters:** Step 3's done-when requires the cross-site insert to be "rejected by the policy", but the test only asserts `.rejects.toThrow()`; any failure (SQL typo, missing grant, constraint error) would pass without exercising the policy.
**Suggested fix:** Assert the Postgres cause code `42501` or the message `new row violates row-level security policy`.
**Resolution:** Fixed: the cross-site insert test asserts the Postgres cause code `42501`.

### F-05 [P3] fixed - @cms/db typecheck skips its test files, unlike @cms/schema

**File:** packages/db/tsconfig.json:9
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** The spec asked to exclude tests from the build, but the single `tsconfig.json` also excludes `src/**/*.test.ts` and `src/test` from `pnpm typecheck`, and Vitest does not typecheck, so type errors in tests go unnoticed. `@cms/schema` typechecks everything via `tsconfig.json` and excludes tests only in `tsconfig.build.json`. The tests type-check cleanly today (scratch tsconfig).
**Suggested fix:** Follow the `@cms/schema` pattern: no exclude in `tsconfig.json` (with `noEmit`), a `tsconfig.build.json` with the exclude and `outDir`, and `build` pointed at it.
**Resolution:** Fixed: `tsconfig.json` typechecks all of `src` (tests included) with `noEmit`; `tsconfig.build.json` excludes tests and emits `dist`.
