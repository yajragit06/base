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
