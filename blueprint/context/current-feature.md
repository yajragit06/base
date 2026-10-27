# Feature: Sign-in and roles

**From build-plan:** feature 4
**Build attempt:** 1
**Branch:** feature/sign-in-and-roles

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

- [ ] 1. **Users and memberships.** Tables, generated migration, and a custom migration
  for row-level security on `memberships`. Data-access functions: `findOrCreateUser`,
  `findUsersByEmail`, `getMembership`, `listMembershipsForUser`, and a transaction-taking
  `setMembershipInTx`.
  **Done when:** integration tests prove users are created once per auth id (concurrent
  first requests create one row), memberships are unique per user and site, another
  site's memberships are invisible inside `withSite`, and there is no migration drift.
- [ ] 2. **Role authorizer.** `PERMISSIONS` maps each permission to the roles that hold
  it; `roleAuthorizer(db)` allows system actors, denies agents, and allows a user only
  when their role on the command's site holds the permission. Unknown permissions and
  install-level permissions are denied for users.
  **Done when:** a table-driven test covers every role against every permission in the
  table, plus a non-member, a member of another site (cross-site), an agent, a system
  actor and an unknown permission.
- [ ] 3. **`membership.grant` command.** Owners and Admins grant or change roles; only an
  Owner may grant the Owner role or change an Owner's role; a site always keeps at least
  one Owner.
  **Done when:** tests prove each rule (including `last_owner` and an Admin trying to make
  or demote an Owner), the change and its audit row commit together, and a cross-site
  grant is refused with no audit row.
- [ ] 4. **Sign-in in the API.** `AuthAdapter`, the Clerk adapter, the Fastify auth hook
  and `GET /me`. `buildApp` takes its database and auth adapter as dependencies;
  `server.ts` builds the Clerk adapter from `CLERK_SECRET_KEY` and refuses to start
  without it.
  **Done when:** `app.inject` tests with a fake adapter prove a missing, malformed or
  rejected token returns 401 without creating a user, a valid token creates the user once
  and returns only that user's memberships (cross-site test with two users and two
  sites), and `/healthz` stays public. A unit test proves the Clerk adapter maps a
  verified token and profile to our identity using a stubbed Clerk client.
- [ ] 5. **Bootstrap script and docs.** `pnpm --filter @cms/api create-site` runs
  `site.create` and `membership.grant` (Owner) as a system actor for a user who has signed
  in once; document it, the new env vars and `@cms/core`'s authorizer in `AGENTS.md`.
  **Done when:** an integration test runs the script's function end to end (site
  created, Owner granted, two audit rows), it fails clearly when the email matches no
  user or more than one, and `pnpm verify` passes.

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
interface AuthIdentity { authId: string; email: string; name: string | null }
interface AuthAdapter {
  /** The identity for a session token, or null if it is not valid. Never throws for bad tokens. */
  verify(token: string): Promise<AuthIdentity | null>;
}
```

The Clerk adapter verifies the session token with `@clerk/backend` (`CLERK_SECRET_KEY`)
and reads the user's primary email and name from Clerk only when needed. The API reads
`Authorization: Bearer <token>`; anything else is unauthenticated.

**`GET /me`** - 200 `{ user: { id, email, name }, memberships: [{ siteId, siteName,
role }] }` for a valid token; 401 `{ error: "unauthenticated" }` otherwise. It creates
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
