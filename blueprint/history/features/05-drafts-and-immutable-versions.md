# Feature: Drafts and immutable versions

**From build-plan:** feature 5
**Build attempt:** 1
**Branch:** feature/drafts-and-immutable-versions
**Status:** verified

## Goal

An entry's field data lives in immutable versions, one chain per locale. Saving creates a
new draft version validated against the entry's content type; nothing is ever edited in
place, and nothing a draft does can change published content [FR-1.2, FR-1.3, B2, rule 2].
Authors save drafts only on entries they created; Editors and up on any entry.

## Decisions confirmed for this feature

- **Author scope:** own entries only (confirmed by the user). Entries record their creator;
  Feature 13 later widens this with subtree grants.

## In scope

- A `versions` table in `@cms/db` with the locked data-model shape, row-level security,
  and a trigger that rejects deletes and every change except `status`.
- `entries.created_by_type` and `created_by_id`, set by `entry.create`.
- An `entry.saveDraft` command: validates the data against the entry's content type,
  appends a draft to the locale's chain, refuses stale saves, and enforces the Author rule.
- A content type registry passed to commands through `CommandDeps`.
- Read functions: one version, the latest version of a locale, and a bounded history list.

## Out of scope

- Publishing, unpublishing, diff and restore (Feature 9); `entries.published_version_id`
  arrives with publishing. No version is ever `published` or `superseded` yet.
- Autosave timing and the editor UI (Features 6 and 8); HTTP routes for entries.
- Locale fallback (Feature 19), schema version bumps and migrations (Feature 18), preview
  tokens (Feature 25), subtree policies (Feature 13), AI-made versions (Feature 36).
- Open findings F-10, F-11, F-13, F-14 and F-15.

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step, then present one feature-level review packet. This
feature adds a migration, persisted user data and an authorization rule, so the
`when-sensitive` independent review will be selected before `/complete`.

## Build steps

- [x] 1. **Versions table and entry creator.** Schema, generated migration and a custom
  migration for row-level security and the immutability trigger. Add the creator columns to
  `entries` and have `createEntryInTx` take and store the creator. Data-access functions:
  `appendVersionInTx`, `getVersion`, `getLatestVersion`, `listVersions`.
  **Done when:** integration tests prove an UPDATE of `data` (or any column but `status`)
  and a DELETE are rejected even as the table owner; another site's versions are invisible
  and cannot be inserted inside `withSite`; a second root or a second child of the same
  version for one entry and locale fails with `version_conflict`; a base version from
  another entry or locale is refused; and there is no migration drift.
- [x] 2. **`entry.saveDraft` command.** Add `contentTypes` to `CommandDeps` and the
  context handlers receive; add the permission row; implement the rules below.
  `entry.create` records the actor as creator.
  **Done when:** tests prove a valid save returns a draft with the right schema version,
  actor and base, plus exactly one audit row with the stated diff; invalid data returns
  `invalid_input` with field errors under `data`, and nothing is written; an unknown
  content type, unknown entry, entry from another site, locale not on the site, unknown
  base and stale base each fail with their code and no audit row; an Author saves on
  their own entry but gets `forbidden` on someone else's or a creator-less entry, while an
  Editor saves on both; a Viewer, an agent and a non-member are refused; two concurrent
  saves on the same base produce one version and one `version_conflict`.
- [x] 3. **Docs and final gate.** Document the registry dependency, `entry.saveDraft` and
  the version rules in `AGENTS.md`, and add the new error codes to the layout notes.
  **Done when:** `pnpm verify` passes and the CI drift check is clean.
- [x] 4. **Repair review findings F-16, F-17 and F-13 (for `entry.saveDraft`).** Correlate
  the latest-version subquery on entry and locale so it uses the chain index; list every
  code `entry.saveDraft` can return in `AGENTS.md`; and in the save's own transaction refuse
  a user whose current role no longer holds `entry.saveDraft` (demoted or removed after the
  authorizer ran) with `forbidden`.
  **Done when:** an `EXPLAIN` test shows the latest-version query no longer scans every
  version in the site; a test demotes an Editor to Viewer (and removes another) between the
  authorizer and the save and gets `forbidden` with no version or audit row; a
  `listVersions` test covers limit clamping; F-16 and F-17 are marked `fixed` and F-13's
  `entry.saveDraft` part is noted as repaired; and `pnpm verify` passes.

## Files / areas

- `packages/db/src/schema.ts`, `packages/db/drizzle/` - `versions`, the entry creator
  columns, and the migrations
- `packages/db/src/versions.ts` (new) - version functions; `entries.ts` - creator
- `packages/db/src/errors.ts`, `src/index.ts` - error codes and exports
- `packages/core/src/command.ts` - `contentTypes` in `CommandDeps` and `CommandContext`
- `packages/core/src/commands/versions.ts` (new) - `entry.saveDraft`
- `packages/core/src/commands/entries.ts`, `src/permissions.ts`, `src/errors.ts`,
  `src/index.ts`
- `packages/core` and `packages/db` tests; `AGENTS.md`

## Data / contracts

**`versions`** (row-level secured with the `app.site_id` policy; immutable)

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key, `gen_random_uuid()` |
| `site_id` | uuid | with `entry_id`, references `entries (site_id, id)` |
| `entry_id` | uuid | the entry |
| `locale` | text | one of the site's `locales`, checked by the command |
| `data` | jsonb | field data validated by the content type; stored exactly as validated |
| `schema_version` | integer | `1` until Feature 18 adds versioned content types (rows stay correct as version 1) |
| `status` | text | `draft`, `published` or `superseded` (check); default `draft` |
| `actor_type` | text | `user`, `agent` or `system` (check) |
| `actor_id` | text | non-empty (check) |
| `based_on_version_id` | uuid, nullable | the previous version in this locale's chain; null for the first |
| `ai` | jsonb, nullable | model, prompt template id and tokens; always null until Feature 36 |
| `created_at` | timestamptz | default now() |

Constraints:

- `versions_chain_key`: unique `(entry_id, locale, based_on_version_id)` with
  `NULLS NOT DISTINCT`, so each locale has one first version and each version at most one
  successor. The chain is linear and the latest version is the one with no successor.
- Unique `(site_id, entry_id, locale, id)`, and a foreign key from
  `(site_id, entry_id, locale, based_on_version_id)` to it, so a base must be in the same
  entry and locale.
- Index `(site_id, entry_id, locale, created_at)` for history.
- Trigger `versions_immutable`: rejects DELETE, and rejects an UPDATE unless
  `to_jsonb(NEW) - 'status'` equals `to_jsonb(OLD) - 'status'`
  (`insufficient_privilege`). Status transitions are Feature 9's to define.

**`entries`** gains `created_by_type` (text, nullable, `user`/`agent`/`system` check) and
`created_by_id` (text, nullable). They are nullable so the previous release's code keeps
inserting (rule 11). A null creator matches no Author.

**`entry.saveDraft`** - input
`{ siteId: uuid, entryId: uuid, locale: string, baseVersionId: uuid | null, data: unknown }`
(strict); permission `entry.saveDraft` (Owner, Admin, Editor, Author). Inside the command
transaction:

1. Lock the entry row (`FOR NO KEY UPDATE`, filtered by `site_id`); missing gives
   `entry_not_found`.
2. If the actor is a user whose role on the site (read in the same transaction) is
   `author`, require `created_by_type = 'user'` and `created_by_id` = the actor id, else
   `forbidden`. Other roles and system actors skip this.
3. `locale` must be in the site's `locales`, else `invalid_locale`.
4. Look up the content type by `entry.type_key` in `contentTypes`; none gives
   `unknown_content_type`. Run `validateEntry`; failures give `invalid_input` with each
   field error's path prefixed by `"data"`.
5. `baseVersionId` must be the latest version for the entry and locale (null when there is
   none). A base that is not a version of this entry and locale gives `version_not_found`;
   an older base gives `version_conflict`. The chain constraint maps to `version_conflict`
   as a backstop.
6. Insert the draft with the validated data, `schema_version` 1 and the actor.

Returns the new version. Audit: target `entry` / `entryId`, diff
`{ before: { versionId } | null, after: { versionId, locale } }`. Field data is not copied
into the audit log; the immutable version holds it.

New error codes: `entry_not_found`, `version_not_found`, `version_conflict` (`DbErrorCode`)
and `unknown_content_type` (`CommandErrorCode`).

**Registry:** `CommandDeps.contentTypes?: readonly ContentType[]`, passed to handlers as
`ctx.contentTypes` (empty when absent). Keys are unique; a duplicate key throws when
`runCommand` builds the lookup.

**Reads** (each inside `withSite`, filtered by `site_id`): `getVersion(db, siteId, id)`,
`getLatestVersion(db, siteId, entryId, locale)`, and
`listVersions(db, siteId, entryId, { locale?, limit? })`, newest first, `limit` default 50,
capped at 100.

## Testing

`pnpm test` exists, so every logic step ships passing tests.

- `@cms/db`: integration tests against real Postgres, including the trigger as the table
  owner (not only as `cms_app`) and a cross-site insert and read.
- `@cms/core`: command tests against real Postgres with `roleAuthorizer` and real
  memberships, plus a concurrent save test.
- Final gate: `pnpm verify`. Last run on this code (main at 4468c19, unchanged since
  079967a): pass (typecheck, lint, 129 tests, build).

## Notes for the AI

- Follow the earlier patterns: `withSite`, explicit `site_id` filters, constraint names
  mapped to error codes, `z.strictObject` inputs, transaction-taking `*InTx` functions.
- Never trust a base or entry id across sites: every lookup filters by `site_id`.
- Use `structuredClone`d validated data from `validateEntry`, never the raw input.
- Keep `entry.create`'s input unchanged; the creator comes from `ctx.actor`, never input.

## Open questions

None remaining; the Author scope was confirmed before this spec was written.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":10529,"specSha256":"a8236470413b0b5d36ccde3c270fb779e8d0a9bec53c7881dfd07305842376a8","branch":"refs/heads/feature/drafts-and-immutable-versions","head":"90406fd9840626ff6a4b654c55566e460c075f66","baseRef":"refs/heads/main","baseCommit":"4468c19412b02f6361b378663eba0057bf3622af","sourceTree":"4fe7f13c3dae3dcfe11250a0c9b2f56c0eed8454","landing":"pull-request","absentOptional":[]} -->

## Findings

### 05/F-16 [P2] closed - Latest-version lookup scans every version in the site on each save

**File:** packages/db/src/versions.ts:94
**Found:** 2026-10-27 by /audit independent (scope: current; lens: performance)
**Why it matters:** `getLatestVersionInTx`'s `NOT EXISTS` subquery correlates `next` only on `site_id` and `based_on_version_id`. No index leads with `based_on_version_id` (`versions_chain_key` is `(entry_id, locale, based_on_version_id)`), so Postgres hash-anti-joins against every version in the site. An EXPLAIN ANALYZE probe with 2,000 entries x 50 versions (100k rows, rolled back) showed a seq scan of all 100k rows and about 57 ms per call. `entry.saveDraft` runs this on every save while holding the entry row lock, so cost grows with the whole site's history and serializes saves on that entry. Autosave (Feature 6) will make this the hottest write path.
**Suggested fix:** Add `eq(next.entryId, versions.entryId)` and `eq(next.locale, versions.locale)` to the subquery (or pass the literal entry id and locale), which lets the planner use `versions_history_idx`/`versions_chain_key`. The same probe then ran in 0.19 ms. No schema change is needed and no current requirement is lost.
**Resolution:** Fixed: the successor subquery in `latestVersionQuery` (packages/db/src/versions.ts) now also matches `entry_id` and `locale`, so it can use `versions_chain_key`. A query-plan test (versions.test.ts, "latest-version query plan") loads 200 entries x 20 versions, analyzes, and asserts the plan has no sequential scan; it fails against the previous query. Closed 2026-10-27 by independent review of 4468c19..90406fd: an EXPLAIN ANALYZE probe at 100k versions shows a Merge Anti Join over `versions_chain_key` (0.43 ms) against the old query's 100k-row Seq Scan (54 ms). At the test's 200 x 20 size the old query still seq scans and the new one does not, so the test discriminates. Semantics are unchanged because the outer query already fixes the entry and locale, and the repair introduced no new defect.

### 05/F-17 [P3] closed - AGENTS.md omits the new error codes the spec asked to document

**File:** AGENTS.md:43
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality)
**Why it matters:** Build step 3 says to "add the new error codes to the layout notes". The updated layout notes mention only `version_conflict`; `entry_not_found`, `version_not_found` (DbErrorCode) and `unknown_content_type` (CommandErrorCode) are not listed. Feature 3 will map these codes to API responses, and the docs are the contract agents read first.
**Suggested fix:** In the `packages/core` bullet, name the codes that `entry.saveDraft` can return: `entry_not_found`, `invalid_locale`, `unknown_content_type`, `invalid_input`, `version_not_found`, `version_conflict`, `forbidden`. Documentation only; no current requirement is lost.
**Resolution:** Fixed: the `packages/core` bullet in AGENTS.md lists every code `entry.saveDraft` returns: `forbidden`, `entry_not_found`, `invalid_locale`, `unknown_content_type`, `invalid_input`, `version_not_found` and `version_conflict`. Closed 2026-10-27 by independent review of 4468c19..90406fd: the list matches every reachable code in packages/core/src/commands/versions.ts and appendVersionInTx; `site_not_found` (versions.ts:59) is effectively unreachable because an entry exists only for an existing site.

## Independent review

**Status:** passed
**Target commit:** 90406fd9840626ff6a4b654c55566e460c075f66
**Base commit:** 4468c19412b02f6361b378663eba0057bf3622af
**Base ref:** refs/heads/main
**Spec hash:** a8236470413b0b5d36ccde3c270fb779e8d0a9bec53c7881dfd07305842376a8
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T15:01:59Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T15:05:11Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `4468c19412b02f6361b378663eba0057bf3622af..90406fd9840626ff6a4b654c55566e460c075f66` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`, `git merge-base refs/heads/main HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain`: pass (HEAD = target, merge base = base commit, spec hash matches, only review.md and findings.md differ)
- `pnpm verify` (TEST_DATABASE_URL=postgres://cms:cms@localhost:5432/cms_test): pass (fully replayed from the Turbo cache, so rerun uncached below)
- `pnpm turbo run typecheck build --force`: pass (10/10 tasks, 0 cached)
- `pnpm lint`: pass (1 warning in packages/core/src/command.test.ts:44, a file this delta does not touch)
- `pnpm turbo run test --concurrency=1 --force`: pass (schema 39, db 48, core 56, api 11 tests; 0 cached)
- `pnpm --filter @cms/db generate`: pass ("No schema changes, nothing to migrate"; no files written)
- `psql` EXPLAIN ANALYZE probes of the old and new latest-version queries and listVersions, inside a rolled-back transaction as cms_app: pass

### Evidence

- Scope: the complete 4468c19..90406fd delta (21 files: AGENTS.md, spec, packages/core command/versions/permissions/errors/index, packages/db schema/entries/errors/index/versions, migrations 0006/0007 and snapshots, tests), reviewed against the spec's Data/contracts and every Done-when.
- F-16 repaired. Probe at 2,000 entries x 50 versions (100k rows): the new query is a Merge Anti Join over `versions_chain_key`, 0.43 ms. The old query is a Seq Scan of 100k rows, 54 ms. At the test's own size (200 x 20) the old query still seq scans and the new one does not, so the plan test discriminates between them.
- F-17 repaired. The AGENTS.md packages/core bullet lists forbidden, entry_not_found, invalid_locale, unknown_content_type, invalid_input, version_not_found and version_conflict. `site_not_found` (versions.ts:59) is effectively unreachable, because an entry row exists only for an existing site.
- F-13 (saveDraft part): packages/core/src/commands/versions.ts:43-53 re-reads the membership after the entry lock and requires a role in `PERMISSIONS["entry.saveDraft"]`. Null or viewer now fails closed. The racing-authorizer test proves the case of a demotion or removal after the authorizer ran.
- Immutability: the 0007 trigger rejects DELETE and any change except `status`. Tests run it as the non-superuser table owner and as cms_app. RLS is enabled and forced with a USING/WITH CHECK policy. The cross-site insert and read are tested.
- Chain: `versions_chain_key` NULLS NOT DISTINCT, plus a composite FK to `(site_id, entry_id, locale, id)`. The entry lock (FOR NO KEY UPDATE) serializes saves, and the constraint backstop maps to version_conflict. Concurrent tests exist in both db and core.
- Tenant scoping: every new query filters by site_id inside withSite. The locale is checked against the site's locales before it is used in a query. Field data stays out of the audit diff.
- Migrations: forward-only, with nullable creator columns (rule 11). No drift.

### Findings

- F-16 closed, F-17 closed
- F-13 stays open (P3): the saveDraft part is repaired, and a residual narrow window is noted in its Resolution
- F-18 [P3] open (new): no test proves the stored draft data is the validated output rather than the raw input

### Remaining risk

- The in-transaction role re-read is an unlocked READ COMMITTED read. A demotion that commits after it but before the save commits is not seen (window of a few ms; recorded under F-13).
- The latest-version lookup reads every version in one entry/locale chain on each save. This is linear in chain length, not site size. It is unverified at autosave-scale chain lengths (Feature 6).
- `pnpm verify` replayed from the Turbo cache; the uncached evidence is the forced turbo runs above. The CI workflow itself (migrations on an empty database) was not run.
- Older open P3s F-10, F-11, F-14 and F-15 were outside this review's scope and remain open.

## Try it now

No HTTP route or UI exposes drafts yet (the editor arrives in Features 6 and 8), so the direct path is the test suites:

1. `pnpm --filter @cms/db test -- versions` shows the immutability trigger, site isolation, the version chain and the query-plan check.
2. `pnpm --filter @cms/core test -- versions` shows `entry.saveDraft`: validation errors under `data`, `version_conflict` on a stale base, the Author own-entries rule, and a demoted Editor refused.
