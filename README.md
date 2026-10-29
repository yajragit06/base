<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
    <img src="assets/logo-light.svg" alt="Base" width="220" height="64">
  </picture>
</p>

<p align="center"><strong>The tree-first CMS for developers, editors and AI agents.</strong></p>

Base is an open-source, TypeScript, API-first content management system. Every site is a
tree of pages, as in MODX: where a page sits in the tree is its URL. Developers define
content types in code and own every line of markup. Editors get a clean admin generated
from those types, with drafts, previews and version history. Apps read the same content
through a typed API. AI agents can search, draft and edit over MCP, and a person with the
right role always approves what goes live.

The core is free and MIT-licensed. Paid add-ons (AI, team governance and managed hosting)
live in separate packages, and the core never depends on them.

> **Status:** early development. Built so far: content type definitions, sites and the
> page tree, the audited write path, and sign-in with per-site roles. The admin app and
> the public APIs come next; see the [build plan](blueprint/build-plan.md).

## Layout

- `apps/web` the Next.js app: the admin at `/admin` and the API at `/api`, in one deploy.
- `packages/http` the API, written once against web-standard `Request`/`Response`, with
  sign-in through an auth adapter (Clerk today): `GET /api/me` and the page tree.
- `apps/api` an optional Fastify host for the same API (the Scale pack), and the
  `create-site` script for new sites.
- `packages/schema` `defineContentType()`, the field builders and `validateEntry()`.
- `packages/db` Drizzle schema and migrations: sites, domains, the entry tree, users,
  memberships and the append-only audit log, isolated per site with row-level security.
- `packages/core` the single write path: typed commands with role checks and an audit row
  in the same transaction.

More apps and packages (worker, SDK, CLI, MCP server, site starter) arrive with the
build-plan features that need them. Code packages still use the `@cms/*` scope.

## Commands

```bash
cp .env.example .env
pnpm install
pnpm db:start        # local Supabase (needs Docker); or point DATABASE_URL at any Postgres 15+
pnpm db:migrate      # apply migrations
pnpm db:doctor       # check the database is ready and closed to Supabase's Data API
pnpm db:create-test  # create the disposable test database (TEST_DATABASE_URL)
pnpm dev             # the app on :3000: admin at /admin, API at /api (GET /api/healthz)
pnpm verify          # typecheck, lint, test, build (CI runs the same plus migrations)
pnpm db:generate     # after editing packages/db/src/schema.ts; commit the migration
pnpm format          # Biome format and safe lint fixes
```

Database tests need `TEST_DATABASE_URL` exported (a disposable database). The app needs
`DATABASE_URL` and the Clerk keys from `.env.example`.

### Vercel

Set the Vercel project's root directory to `apps/web`, and add `DATABASE_URL` (the Supabase
session pooler URL below), `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/admin/sign-in`. No separate API server is needed. `AGENTS.md` has the full command list and the project rules.

### Supabase

Give Base its own Supabase project. Base's migrations take away the Data API roles'
(`anon`, `authenticated`, `service_role`) access to everything in the `public` schema,
including tables created there later by the same user, so other Data API clients of a
shared project would stop working.

1. Turn off the Data API (Project settings > Data API), or remove `public` from its
   exposed schemas.
2. Download the database's CA certificate (Database settings > SSL configuration) and keep
   it somewhere on the machine, for example `/home/you/certs/supabase-ca.crt` (it is public,
   not a secret).
3. Set `DATABASE_URL` to the **session pooler** URL (Connect > Session pooler, port 5432)
   plus `?sslmode=verify-full&sslrootcert=/home/you/certs/supabase-ca.crt`. Use an
   absolute path: the scripts run from each package's folder, so a relative path is read
   from there and fails with `ENOENT`. The `pg` driver treats a bare `sslmode=require` as
   `verify-full` too, and without the CA certificate the connection can fail certificate
   checks. The transaction pooler (port 6543) is not supported.
4. Run `pnpm db:migrate`, then `pnpm db:doctor`: every line should read `ok`. If it cannot
   connect, it prints the driver's reason (for example a certificate or password error).

## Planning files

Base is built with the [AI Blueprint](https://github.com/aiblueprinthq/ai-blueprint)
workflow, one reviewed feature at a time.

| File | What it holds |
| --- | --- |
| `blueprint/project-plan.md` | The full plan: problem, users and roles, features with PRD IDs, data, stack, pricing, UI, deployment, NFRs, core rules, metrics, milestones and gates, risks, open questions |
| `blueprint/build-plan.md` | 54 numbered features in build order across M0-M3 (v1) and v1.1, each tagged with its PRD story IDs |
| `blueprint/context/project-overview.md` | The compact overview agents read, with the plan fingerprint |
| `blueprint/history/` | The archived spec, findings and independent review of every completed feature |
