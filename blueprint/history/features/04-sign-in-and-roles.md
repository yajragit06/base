# Feature: Sign-in and roles

**From build-plan:** feature 4
**Build attempt:** 1
**Branch:** feature/sign-in-and-roles
**Status:** verified

## Goal

People sign in with Clerk, behind an auth adapter so self-hosters can swap providers, and
every command is authorized by the person's role on the site: Owner, Admin, Editor,
Author or Viewer, enforced in the core rather than only in the UI [FR-6.1, FR-6.2].
This replaces Feature 3's deny-everything default with real rules.

## Decisions confirmed for this feature

- **Role matrix:** as in `blueprint/project-plan.md` section 2, confirmed by the user.
- **Site creation:** system actors only (a CLI or seed). No signed-in user can create a
  site in v1; a system job also assigns each site's first Owner.
- **Identity:** Clerk only proves who the person is. Users and per-site roles live in our
  database, so the auth adapter stays swappable.

## In scope

- `users` and `memberships` tables in `@cms/db`, with migrations; memberships are
  row-level secured per site.
- A permission table and a `roleAuthorizer` in `@cms/core` that replaces `denyAll` for
  user actors.
- A `membership.grant` command (assign or change a user's role on a site).
- An `AuthAdapter` interface, a Clerk implementation (`@clerk/backend`), and a Fastify
  hook in `apps/api` that turns a bearer session token into an actor.
- `GET /me`: the signed-in person and their site roles. The first verified request also
  creates the user record.
- A system script that creates a site and makes an existing user its Owner.

## Out of scope

- Sign-in screens and the admin shell (Feature 6); invitations and the users screen
  (Feature 12); subtree policies (Feature 13).
- Agent and app API tokens (Feature 21). Agent actors stay denied for now.
- Removing members, deleting users and personal-data controls (Features 12 and 42).
- Rate limiting, Sentry and production startup checks (Feature 31).
- A dev mode that trusts headers instead of Clerk; tests use a fake adapter.
- Open findings F-10 and F-11; they stay in the ledger for a separate fix.

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step, then present one feature-level review packet.
This feature adds authentication and authorization, so the `when-sensitive` independent
review will be selected before `/complete`.

## Build steps

- [x] 1. **Users and memberships.** Tables, generated migration, and a custom migration
  for row-level security on `memberships`. Data-access functions: `findOrCreateUser`,
  `findUsersByEmail`, `getMembership`, `listMembershipsForUser`, and a transaction-taking
  `setMembershipInTx`.
  **Done when:** integration tests prove users are created once per auth id (concurrent
  first requests create one row), memberships are unique per user and site, another
  site's memberships are invisible inside `withSite`, and there is no migration drift.
- [x] 2. **Role authorizer.** `PERMISSIONS` maps each permission to the roles that hold
  it; `roleAuthorizer(db)` allows system actors, denies agents, and allows a user only
  when their role on the command's site holds the permission. Unknown permissions and
  install-level permissions are denied for users.
  **Done when:** a table-driven test covers every role against every permission in the
  table, plus a non-member, a member of another site (cross-site), an agent, a system
  actor and an unknown permission.
- [x] 3. **`membership.grant` command.** Owners and Admins grant or change roles; only an
  Owner may grant the Owner role or change an Owner's role; a site always keeps at least
  one Owner.
  **Done when:** tests prove each rule (including `last_owner` and an Admin trying to make
  or demote an Owner), the change and its audit row commit together, and a cross-site
  grant is refused with no audit row.
- [x] 4. **Sign-in in the API.** `AuthAdapter`, the Clerk adapter, the Fastify auth hook
  and `GET /me`. `buildApp` takes its database and auth adapter as dependencies;
  `server.ts` builds the Clerk adapter from `CLERK_SECRET_KEY` and refuses to start
  without it.
  **Done when:** `app.inject` tests with a fake adapter prove a missing, malformed or
  rejected token returns 401 without creating a user, a valid token creates the user once
  and returns only that user's memberships (cross-site test with two users and two
  sites), and `/healthz` stays public. A unit test proves the Clerk adapter maps a
  verified token and profile to our identity using a stubbed Clerk client.
- [x] 5. **Bootstrap script and docs.** `pnpm --filter @cms/api create-site` runs
  `site.create` and `membership.grant` (Owner) as a system actor for a user who has signed
  in once; document it, the new env vars and `@cms/core`'s authorizer in `AGENTS.md`.
  **Done when:** an integration test runs the script's function end to end (site
  created, Owner granted, two audit rows), it fails clearly when the email matches no
  user or more than one, and `pnpm verify` passes.
- [x] 6. **Repair review finding F-12.** The Clerk adapter accepts a primary email only
  when Clerk reports it verified; otherwise `getProfile` throws `UnverifiedEmailError`,
  and `requireUser` answers 403 `{ error: "email_not_verified" }` without creating a user.
  **Done when:** the stubbed-Clerk test covers verified, unverified and missing
  verification; an `app.inject` test proves an unverified person gets 403 and no user
  row; F-12 is marked `fixed`; and `pnpm verify` passes.

## Files / areas

- `packages/db/src/schema.ts`, `packages/db/drizzle/` - `users`, `memberships` and their
  migrations
- `packages/db/src/users.ts` - user and membership functions
- `packages/core/src/permissions.ts` - `ROLES`, `PERMISSIONS`, `roleAuthorizer`
- `packages/core/src/commands/memberships.ts` - `membership.grant`
- `apps/api/src/auth.ts` - `AuthAdapter`, Clerk adapter, Fastify hook
- `apps/api/src/routes/me.ts` - `GET /me`
- `apps/api/src/app.ts`, `src/server.ts` - dependency injection, env
- `apps/api/src/scripts/create-site.ts` - bootstrap script
- `apps/api/package.json`, `vitest.config.ts`, test setup (database tests)
- `.env.example`, `AGENTS.md`

## Data / contracts

**`users`** (install-level, not row-level secured)

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | primary key |
| `auth_id` | text | the adapter's stable subject id (Clerk user id); unique |
| `email` | text | primary email from the provider, stored lowercase |
| `name` | text, nullable | display name from the provider |
| `created_at` | timestamptz | default now() |

**`memberships`** (row-level secured with the `app.site_id` policy)

| Column | Type | Rules |
| --- | --- | --- |
| `site_id` | uuid | references `sites` |
| `user_id` | uuid | references `users` |
| `role` | text | `owner`, `admin`, `editor`, `author` or `viewer` (check constraint) |
| `created_at`, `updated_at` | timestamptz | default now() |

Primary key `(site_id, user_id)`.

**Permissions** (only for commands that exist; later features add rows)

| Permission | Owner | Admin | Editor | Author | Viewer |
| --- | --- | --- | --- | --- | --- |
| `entry.create` | yes | yes | yes | yes | no |
| `site.addDomain` | yes | yes | no | no | no |
| `membership.grant` | yes | yes | no | no | no |
| `site.create` | system actors only | | | | |

`roleAuthorizer(db)`: a system actor is always allowed; an agent is denied (Feature 21);
a user is allowed only when `permission` is in `PERMISSIONS`, the command names a site,
and the user's membership on that site has one of the listed roles. The membership is
read inside `withSite(siteId)` and filtered by `site_id`. `denyAll` stays the default in
`runCommand` callers that pass nothing else.

**`membership.grant`** - input `{ siteId, userId, role }`; permission `membership.grant`;
upserts the membership; audit target `membership` / `userId`, diff
`{ before: { role } | null, after: { role } }`. Extra rules inside the transaction:

- Granting `owner`, or changing a membership whose current role is `owner`, requires the
  acting user to be an Owner (system actors may). Otherwise `CommandError("forbidden")`.
- Changing the last Owner to another role fails with `last_owner`.
- An unknown `userId` fails with `user_not_found`.

New error codes: `user_not_found`, `last_owner` (added to `DbErrorCode` so the mapping to
`CommandError` stays in one place).

**Auth adapter**

```ts
interface AuthAdapter {
  /** The provider's subject id for a valid session token, else null. Never throws for bad tokens. */
  verify(token: string): Promise<string | null>;
  /** The person's email and name; only called the first time we see them. */
  getProfile(authId: string): Promise<{ email: string; name: string | null }>;
}
```

(Split from a single `verify` returning the whole identity during implementation, so the
Clerk API is called only for a user's first request, not on every request.)

The Clerk adapter verifies the session token with `@clerk/backend` (`CLERK_SECRET_KEY`)
and reads the user's primary email and name from Clerk only when needed. The API reads
`Authorization: Bearer <token>`; anything else is unauthenticated.

**`GET /me`** - 200 `{ user: { id, email, name }, memberships: [{ siteId, siteName,
role }] }` for a valid token; 401 `{ error: "unauthenticated" }` otherwise; 403
`{ error: "email_not_verified" }` the first time a person whose primary email Clerk has
not verified signs in (no user is created, because the email is what the Owner bootstrap
trusts). It creates
the user on first sight (by `auth_id`, idempotent under concurrency). Provisioning a user
mirrors the identity provider and is not audited: `audit_log` rows belong to a site, and
no site is changed.

**Bootstrap script** - `pnpm --filter @cms/api create-site -- --name <name> --time-zone
<zone> --locale <tag> --owner-email <email>`; reads `DATABASE_URL`; actor
`{ type: "system", id: "create-site" }`.

**Env vars:** `CLERK_SECRET_KEY` (API; required to start).

## Testing

`pnpm test` exists, so every logic step ships passing tests.

- `@cms/db` and `@cms/core`: integration tests against real Postgres.
- `apps/api`: `app.inject` tests against real Postgres with a fake `AuthAdapter`; the API
  test setup reuses `runMigrations` and `truncateAllTables`, and its tests now need
  `TEST_DATABASE_URL` like the other packages.
- The Clerk adapter is unit-tested with a stubbed Clerk client; it is not exercised
  against Clerk itself (no keys in CI). Record this as remaining risk.
- Final gate: `pnpm verify`.

## Notes for the AI

- Follow the Feature 2 and 3 patterns: `withSite`, explicit `site_id` filters, constraint
  names mapped to error codes, `z.strictObject` inputs, transaction-taking `*InTx`
  functions for commands.
- The actor comes only from the verified token (or a trusted system context), never from
  a request body or header the client controls.
- Check the current `@clerk/backend` API (`verifyToken`, `createClerkClient`) before
  writing the adapter; pin the version you use.
- Every new route ships an unauthenticated (401) test and a cross-site test (rule 5).

## Open questions

None remaining; the three decisions above were confirmed before this spec was written.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":11264,"specSha256":"d49705bc62b61710349ff6dd4cc84b0c1bbfeafa4d46efa33ee4853c9b28a760","branch":"refs/heads/feature/sign-in-and-roles","head":"079967a6087d4ed715758b701f337625f08c4837","baseRef":"refs/heads/main","baseCommit":"93959a57c8aa1af14e352c5632a510d34cdb6b72","sourceTree":"193235b47e523b77e82fa7868ce0108a6c274627","landing":"pull-request","absentOptional":[]} -->

## Findings

### 04/F-12 [P2] closed - Owner bootstrap trusts an unverified provider email

**File:** apps/api/src/auth.ts:45
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security)
**Why it matters:** `clerkAuthAdapter.getProfile` copies `primaryEmailAddress.emailAddress` into `users.email` without reading its `verification.status`. The installed `@clerk/backend` 3.26.3 types this as `verification: Verification | null`, so Clerk can return an unverified primary address, for example a user created through the Backend API with verification skipped, or an instance that does not require verification at sign-up. `createSiteWithOwner` (apps/api/src/bootstrap.ts:25) then grants the Owner role to whichever single user holds that email. Someone who signs in first with an unverified copy of the intended owner's address would become Owner of the new site. If the real owner has also signed in, the script refuses with "More than one user". Exploiting it depends on how the Clerk instance is configured, so this is not P1, but the email is the only identity link the bootstrap trusts.
**Suggested fix:** In `getProfile`, accept the primary email only when `verification?.status === "verified"`, and otherwise throw, as it already does for a missing email. Extend `ClerkCalls.getUser`'s return type and the stubbed test with a verified case and an unverified case. No current requirement is lost.
**Resolution:** Fixed: the Clerk adapter's `getProfile` accepts the primary email only when `verification.status` is `verified` and otherwise throws `UnverifiedEmailError`; `requireUser` answers 403 `email_not_verified` and creates no user (apps/api/src/auth.ts). Tests cover verified, unverified, expired and missing verification (auth.test.ts) and the 403 with no user row (app.test.ts). Closed 2026-10-27 by /audit independent (fresh subagent, claude-opus-5-5) against 079967a: apps/api/src/auth.ts:303 rejects any status other than `verified`, including a null verification; `requireUser` (auth.ts:330-339) is the only caller of `findOrCreateUser` outside tests and calls it only after `getProfile` returns, so no unverified email can reach `users.email`; existing users are never re-profiled, so no later path overwrites a verified email. The repair introduced no new defect (a profile failure other than `UnverifiedEmailError` is recorded separately as F-14).

## Independent review

**Status:** passed
**Target commit:** 079967a6087d4ed715758b701f337625f08c4837
**Base commit:** 93959a57c8aa1af14e352c5632a510d34cdb6b72
**Base ref:** refs/heads/main
**Spec hash:** d49705bc62b61710349ff6dd4cc84b0c1bbfeafa4d46efa33ee4853c9b28a760
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T09:24:13Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T09:27:10Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `93959a57c8aa1af14e352c5632a510d34cdb6b72..079967a6087d4ed715758b701f337625f08c4837` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git merge-base refs/heads/main HEAD` and `sha256sum blueprint/context/current-feature.md`: pass (merge base, target and spec hash match the request; only review.md differs from the target)
- `pnpm verify` (TEST_DATABASE_URL=cms_test): pass (typecheck 8/8, lint clean, tests schema 39, db 38, core 41, api 11, build 5/5)
- `drizzle-kit generate` in a scratch copy of HEAD: pass (no schema changes, no migration drift)
- `psql` row-level security probe in a rolled-back transaction as `cms_app` with `app.user_id` set: pass (own membership only, no audit rows, UPDATE and DELETE affect 0 rows, INSERT refused)
- `tsx` probe of `buildApp` with a fake adapter whose `getProfile` throws a plain error: fail as expected for F-14 (500 with internal message); lower-case `bearer` scheme gives 401

### Evidence

- Actor identity: `requireUser` (apps/api/src/auth.ts:318) takes the subject only from `AuthAdapter.verify` on a `Bearer` header and loads `request.user` from the database; no body or header field sets the actor. `verifyToken` from `@clerk/backend` 3.26.3 throws on invalid tokens (withLegacyReturn), so the adapter fails closed to 401.
- F-12 repair: auth.ts:303 accepts only `verification.status === "verified"`; the 403 path creates no user (app.test.ts) and the stubbed Clerk test covers unverified, expired and null verification.
- Role matrix in packages/core/src/permissions.ts equals the spec table; the test pins `PERMISSIONS` and covers every role x permission, non-member, cross-site member, agent, system and unknown or install-level permissions.
- `membership.grant` takes `FOR NO KEY UPDATE` on the site row before reading the target and actor roles, so the owner-only rule and `last_owner` count hold under concurrency; the mutual-demotion test proves exactly one owner remains.
- `memberships` row-level security: the site policy (all commands) plus a SELECT-only `app.user_id` policy; `withUser` sets only `app.user_id` under `cms_app`, so it can read the user's own memberships and nothing site-scoped, and cannot write.
- User provisioning is an `ON CONFLICT (auth_id)` upsert; the concurrent test with 10 parallel calls creates one row.
- Bootstrap looks up the owner email before creating anything and refuses zero or multiple matches; it runs both commands as a system actor with two audit rows.
- `user_not_found` and `last_owner` are `DbErrorCode`s mapped to `CommandError` in `runCommand`.
- `/me` ships 401 (missing, malformed, wrong scheme, empty, rejected token), 403 unverified and cross-site membership tests; `/healthz` stays public.
- Performance: one cached-JWKS token check plus one indexed user lookup per request; `/me` runs one short transaction. No unbounded work found.

### Findings

- F-12 [P2] closed: the verified-email repair is correct and introduced no new defect
- F-14 [P3] open: a sign-in with no primary email answers 500 with the internal message
- F-15 [P3] open: the AGENTS.md test command omits that `@cms/api` tests need TEST_DATABASE_URL
- F-10, F-11, F-13 [P3] open: unchanged by this delta; F-13 still accurate

### Remaining risk

- The Clerk adapter is tested only against a stubbed client; real `verifyToken` and `users.getUser` behaviour against a live Clerk instance was not exercised (no keys).
- `verifyToken` is called without `authorizedParties`, so any valid session token from the same Clerk instance is accepted; bearer-only use limits the CSRF concern, but this should be revisited when the admin app (Feature 6) fixes its origins.
- `verify` turns every Clerk error, including a JWKS fetch outage, into 401 rather than a 5xx, which fails closed but can hide a provider outage.
- `createSiteWithOwner` runs `site.create` and `membership.grant` as two transactions; a crash between them leaves a site with no Owner (no reachable path found in normal operation).
- F-13 (role read outside the command transaction) remains a small consistency window.
- A stored user email is never refreshed after first sign-in, so the bootstrap matches the email as first verified; a duplicate is refused rather than mis-granted.
- Check was not required and was not run; no browser or running-server evidence was gathered.

## Try it now

With Postgres running and migrations applied, start the API with any `CLERK_SECRET_KEY` (a placeholder fails closed):

1. `curl -i localhost:4000/healthz` answers 200: the health check stays public.
2. `curl -i localhost:4000/me` answers 401 `{"error":"unauthenticated"}`, and so does `curl -i -H "Authorization: Bearer nonsense" localhost:4000/me`; no user row is created.
3. With a real Clerk key, sign in once, then run `pnpm --filter @cms/api create-site -- --name Demo --time-zone Europe/Paris --locale en --owner-email <your email>`; `GET /me` with your session token now lists Demo with role `owner`.
