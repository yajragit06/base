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

- `apps/api` Fastify API: sign-in through an auth adapter (Clerk today), `GET /me`, and a
  `create-site` script for new sites.
- `apps/admin` Next.js admin app.
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
pnpm dev             # api on :4000 (GET /healthz), admin on :3000
pnpm verify          # typecheck, lint, test, build (CI runs the same plus migrations)
pnpm db:generate     # after editing packages/db/src/schema.ts; commit the migration
pnpm format          # Biome format and safe lint fixes
```

Database tests need `TEST_DATABASE_URL` exported (a disposable database), and the API
needs `CLERK_SECRET_KEY`. `AGENTS.md` has the full command list and the project rules.

### Supabase

1. In your Supabase project, turn off the Data API (Project settings > Data API), or
   remove `public` from its exposed schemas. Base also revokes the API roles' access in a
   migration.
2. Set `DATABASE_URL` to the **session pooler** URL (Connect > Session pooler, port 5432)
   with `?sslmode=require`. The transaction pooler (port 6543) is not supported.
3. Run `pnpm db:migrate`, then `pnpm db:doctor`: every line should read `ok`.

## Planning files

Base is built with the [AI Blueprint](https://github.com/aiblueprinthq/ai-blueprint)
workflow, one reviewed feature at a time.

| File | What it holds |
| --- | --- |
| `blueprint/project-plan.md` | The full plan: problem, users and roles, features with PRD IDs, data, stack, pricing, UI, deployment, NFRs, core rules, metrics, milestones and gates, risks, open questions |
| `blueprint/build-plan.md` | 54 numbered features in build order across M0-M3 (v1) and v1.1, each tagged with its PRD story IDs |
| `blueprint/context/project-overview.md` | The compact overview agents read, with the plan fingerprint |
| `blueprint/history/` | The archived spec, findings and independent review of every completed feature |
