# Feature: Typed commands and audit log

**From build-plan:** feature 3
**Build attempt:** 1
**Branch:** feature/typed-commands-and-audit-log
**Status:** verified

## Goal

Make every write a typed command: Zod-validated input, a permission check, and an audit
entry recording who did it (user, agent or system), committed in the same database
transaction as the change [FR-4.2, FR-6.3]. This becomes the single write path that the
admin UI, Admin API, CLI and MCP agents all use (project rule 4).

## In scope

- New package `packages/core` (`@cms/core`): actors, `defineCommand()`, `runCommand()`, the
  `Authorizer` interface and `CommandError`.
- An append-only, site-isolated `audit_log` table in `@cms/db`, with a migration.
- The three existing writes rewritten as commands: `site.create`, `site.addDomain`,
  `entry.create`. The `@cms/db` write functions gain a form that runs on a caller's
  transaction so the command and its audit entry commit or fail together.
- Exporting the Zod issue mapping from `@cms/schema` so command input errors use the same
  field-error shape as entry validation.

## Out of scope

- Real permission rules, roles and sign-in (Feature 4). This feature ships the
  checkpoint and a deny-by-default authorizer; Feature 4 supplies the rules.
- HTTP routes (the Admin API needs an authenticated actor from Feature 4).
- Reading or filtering the audit log, and its screen (Feature 15).
- Auditing denied attempts or reads; AI metadata values (the `ai` column exists but stays
  null until Feature 33).
- Content validation against registered content types (Feature 5, which also stores
  entry data).
- The open finding F-10 (leading-zero ports); it stays in the ledger for a separate fix.

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step, then present one feature-level review packet.
This feature changes a security boundary and adds a migration, so the configured
`when-sensitive` independent review will be selected before `/complete`.

## Build steps

- [x] 1. **Core package and the command runner.** Create `packages/core` (built and tested
  like `@cms/schema`), the actor type, `defineCommand()`, `runCommand()` with Zod input
  validation, `CommandError` and the `Authorizer` interface with `denyAll` and (for tests
  and system jobs) `allowAll`. Export `fieldErrorsFromZod` from `@cms/schema`.
  **Done when:** unit tests prove invalid input returns `invalid_input` with field errors
  and never calls the handler, a denying authorizer returns `forbidden` and never calls
  the handler, and `pnpm verify` passes.
- [x] 2. **Audit log table.** `audit_log` in the Drizzle schema, a generated migration and a
  custom migration adding row-level security (same policy as `entries`) and a trigger
  that rejects every `UPDATE` and `DELETE`.
  **Done when:** integration tests prove an audit row can be inserted inside
  `withSite`, `UPDATE` and `DELETE` on it fail, another site's rows are invisible, and
  `pnpm db:generate` reports no drift.
- [x] 3. **Transactional writes.** `runCommand` opens the transaction (site-scoped through
  `withSite` when the command has a site), runs the handler on that transaction and
  inserts the audit row before commit. Add transaction-taking forms of `createSite`,
  `addDomain` and `createEntry` in `@cms/db` (the existing functions keep working).
  **Done when:** tests prove a command's change and its audit row commit together, and a
  failure after the change (forced in a test command) leaves neither.
- [x] 4. **The three commands.** `site.create`, `site.addDomain`, `entry.create` in
  `@cms/core`, each with a Zod input schema, a permission name and an audit record.
  **Done when:** tests prove each command writes exactly one audit row with the right
  actor type and id, action, target and diff; `DbError` codes reach the caller unchanged
  as `CommandError` codes; and cross-site attempts (an `entry.create` naming another
  site's parent) fail with no audit row written.
- [x] 5. **Docs.** Add `@cms/core` to `AGENTS.md` and state that new writes go through
  `runCommand`.
  **Done when:** `pnpm verify` passes and the layout reflects the new package.

## Files / areas

- `packages/core/` - `package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `vitest.config.ts`, `src/index.ts`, `src/command.ts`, `src/authorize.ts`,
  `src/errors.ts`, `src/commands/sites.ts`, `src/commands/entries.ts`, tests
- `packages/db/src/schema.ts`, `packages/db/drizzle/` - `audit_log` and its migrations
- `packages/db/src/audit.ts` - `insertAudit(tx, entry)`
- `packages/db/src/sites.ts`, `packages/db/src/entries.ts` - transaction-taking forms
- `packages/schema/src/validate.ts`, `src/index.ts` - export `fieldErrorsFromZod`
- `AGENTS.md`

## Data / contracts

**Actor.** `{ type: "user" | "agent" | "system"; id: string }`. The id is opaque here
(Feature 4 fills it from Clerk users or agent tokens); system actors use a fixed name such
as `"seed"` or `"scheduler"`. The actor always comes from the caller's trusted context,
never from command input.

**Command definition.**

```ts
defineCommand({
  name: "entry.create",            // also the audit action
  permission: "entry.create",      // asked of the Authorizer
  input: z.strictObject({ ... }),  // Zod schema
  siteId: (input) => input.siteId, // undefined for install-level commands
  handler: async (tx, input, ctx) => ({ result, audit: { targetType, targetId, diff } }),
});
```

`runCommand(deps, command, actor, rawInput)`, where `deps = { db, authorize }`:

1. Parse input; failure throws `CommandError("invalid_input", fieldErrors)`. No transaction.
2. `authorize(actor, command.permission, { siteId })`; `false` throws
   `CommandError("forbidden")`. No transaction.
3. Open one transaction (through `withSite` when `siteId` is set), run the handler, insert
   the audit row, commit. Any error rolls back both.
4. `DbError` from the handler becomes `CommandError` with the same `code`; other errors
   propagate unchanged.

**Authorizer.** `(actor, permission, { siteId? }) => boolean | Promise<boolean>`.
`denyAll` is the default; `allowAll` exists for tests and trusted system jobs. Feature 4
replaces the default with role and subtree rules.

**`CommandError`.** `code`: `invalid_input`, `forbidden`, or any `DbErrorCode`; plus
`fieldErrors` (the `@cms/schema` `FieldError[]` shape) for `invalid_input`.

**`audit_log`** (row-level secured, append-only)

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key, `gen_random_uuid()` |
| `site_id` | uuid | references `sites`; the site the change belongs to (for `site.create`, the new site) |
| `actor_type` | text | `user`, `agent` or `system` (check constraint) |
| `actor_id` | text | non-empty |
| `action` | text | the command name, e.g. `entry.create` |
| `target_type` | text | e.g. `site`, `domain`, `entry` |
| `target_id` | text | the changed row's id |
| `diff` | jsonb | `{ "after": {...} }` for creates; later commands add `"before"` |
| `ai` | jsonb, nullable | model, prompt template id, token counts (Feature 33) |
| `created_at` | timestamptz | default now() |

Indexed on `(site_id, created_at)`. A trigger raises an error on any `UPDATE` or `DELETE`,
so the log cannot be edited even by the owner. RLS uses the same `app.site_id` policy as
`entries`; install-level commands set `app.site_id` to the affected site before inserting
the audit row. Diffs contain only the fields the handler chooses: secrets (none exist
yet) must never be put in a diff.

**Commands.**

| Command | Permission | Input | Audit target |
| --- | --- | --- | --- |
| `site.create` | `site.create` | `name`, `timeZone`, `defaultLocale`, `locales` | `site` / new site id |
| `site.addDomain` | `site.addDomain` | `siteId`, `host`, `primary?` | `domain` / new domain id |
| `entry.create` | `entry.create` | `siteId`, `parentId?`, `slug`, `typeKey` | `entry` / new entry id |

## Testing

`pnpm test` exists, so every logic step ships passing tests.

- Unit tests in `@cms/core` for validation, authorization and error mapping that need no
  database.
- Integration tests against real Postgres (`TEST_DATABASE_URL`) for transactions, the
  audit table, append-only enforcement, RLS and cross-site behavior. `@cms/core` tests
  reuse `@cms/db`'s migration and truncation setup.
- Final gate: `pnpm verify`.

## Notes for the AI

- Follow `blueprint/context/coding-standards.md` and the Feature 2 patterns: `DbError`
  codes, `withSite`, constraint-name mapping, `tsconfig.build.json` excluding tests.
- Keep the existing `@cms/db` functions' behavior and tests unchanged; add the
  transaction-taking variants beside them rather than breaking callers.
- Generate the table migration with `pnpm db:generate`; put RLS and the trigger in one
  `--custom` migration. Never edit an applied migration.
- The audit insert must run on the same transaction object as the handler; never open a
  second connection for it.
- Command input schemas use `z.strictObject` so unknown keys are rejected, matching
  `@cms/schema`.

## Open questions

None block this feature. Recorded choices:

- **Deny by default** until Feature 4: with `denyAll`, no user or agent can write. That is
  safe because no route exposes commands yet.
- **Denied attempts are not audited** in this first version of the log; revisit with
  Feature 15 if security reporting needs them.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":9452,"specSha256":"1c11c0303ae44169ad83f9b4faff2b8863a2981ee8ea2322dcaa248d66188e7b","branch":"refs/heads/feature/typed-commands-and-audit-log","head":"95b13f5e62aa19a4f31e2fbe6d3e4c33753a15b2","baseRef":"refs/heads/main","baseCommit":"b63356eebd0b45ff987543b753a31620836bcb1e","sourceTree":"c77c855abf6c308b6725268c99a9808d823c9f0c","landing":"pull-request","absentOptional":[]} -->

## Independent review

**Status:** passed
**Target commit:** 95b13f5e62aa19a4f31e2fbe6d3e4c33753a15b2
**Base commit:** b63356eebd0b45ff987543b753a31620836bcb1e
**Base ref:** refs/heads/main
**Spec hash:** 1c11c0303ae44169ad83f9b4faff2b8863a2981ee8ea2322dcaa248d66188e7b
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T08:53:46Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T08:56:42Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Commands

- `git merge-base refs/heads/main HEAD`: pass (equals Base commit; HEAD equals Target commit)
- `sha256sum blueprint/context/current-feature.md`: pass (matches Spec hash; spec is tracked)
- `git status --porcelain`: pass (only blueprint/context/review.md differs)
- `pnpm verify` (TEST_DATABASE_URL and DATABASE_URL exported): pass (typecheck, lint, build; tests @cms/db 30, @cms/schema 39, @cms/api 1, @cms/core 14)
- `pnpm db:generate` in a throwaway scratch copy of the checkout: pass (no schema changes; no drift)

### Evidence

- packages/core/src/command.ts: input parse and authorize run before any transaction; handler and insertAudit share one transaction (withSite for site-scoped commands, db.transaction plus transaction-local app.site_id for install-level ones); DbError maps to CommandError with the same code; other errors propagate unchanged.
- packages/db/drizzle/0003_audit_log_append_only_and_rls.sql: ENABLE and FORCE row-level security with the same app.site_id policy as entries (USING and WITH CHECK); a BEFORE UPDATE OR DELETE row trigger raises on every change.
- packages/db/src/audit.test.ts: proves insert inside withSite, rejection of another site's row (42501), invisibility of other sites' rows, the actor check constraints, and UPDATE and DELETE refused for the table owner. The local `cms` role is not a superuser, so forced row-level security was exercised.
- packages/core/src/command.test.ts: proves invalid input never reaches the handler, a denying authorizer never reaches the handler, commit together, rollback of the entry and audit row on a forced post-write failure, and rollback when no audit site is returned.
- packages/core/src/commands/commands.test.ts: proves DbError codes pass through (invalid_time_zone, host_taken, parent_not_found, uri_taken), and that a cross-site parent fails with no audit row in either site.
- The actor is a separate trusted parameter; command inputs are z.strictObject; audit diffs come from returned database rows; no secrets exist in any audited row.
- The migration only adds a table, so it is compatible with the previous release; CI runs test suites at --concurrency=1.

### Findings

- F-11 [P3] open: addDomain and entry.create command tests do not fully assert exactly one audit row with actor and diff
- F-10 [P3] open: carried forward from feature 2, out of scope, unchanged by this delta

### Remaining risk

- Append-only enforcement is a row trigger: the table owner can still TRUNCATE (relied on by tests) or drop the trigger; cms_app keeps UPDATE and DELETE grants on audit_log via default privileges (blocked by the trigger, not revoked).
- For install-level commands, the audit row's site comes from the handler's return value; handlers are trusted code, and the site.create test checks it.
- The reviewer did not migrate a fresh empty database (CI does); migrations were applied to the existing test database by the test global setup.
- CI connects as a superuser, which bypasses row-level security on the install-level path; local runs as a non-superuser owner exercised it.
- Check (`/check`) was not run because the request did not require it; no HTTP route exposes commands yet.
