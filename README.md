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
pnpm infra:up        # Postgres (pgvector) + Redis in Docker
pnpm db:migrate      # apply migrations
pnpm dev             # api on :4000 (GET /healthz), admin on :3000
pnpm verify          # typecheck, lint, test, build (CI runs the same plus migrations)
pnpm db:generate     # after editing packages/db/src/schema.ts; commit the migration
pnpm format          # Biome format and safe lint fixes
```

Database tests need `TEST_DATABASE_URL` exported (a disposable database), and the API
needs `CLERK_SECRET_KEY`. `AGENTS.md` has the full command list and the project rules.

## Deploy for testing

The admin app runs on **Vercel**; the API and Postgres run on **Render** from `render.yaml`.
The admin calls the API from its server, so the API needs no CORS setup.

1. **Clerk:** create an application (a development instance is fine) with email
   verification on, and copy its publishable and secret keys.
2. **Render:** New > Blueprint, pick this repository, and enter `CLERK_SECRET_KEY` when asked.
   This creates `base-db` (Postgres 16) and `base-api`, which runs migrations on every start
   and is healthy when `GET /healthz` answers `{"ok":true}`. The first migration creates the
   `cms_app` role, so the database user needs permission to create roles: if the first
   deploy fails with `permission denied to grant role "cms_app"`, the database user lacks
   it.
3. **Vercel:** import the repository with **Root Directory** `apps/admin` (Next.js and pnpm
   are detected), and set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` and `API_URL` (the `base-api` URL from Render).
4. **First site:** sign in to the admin once, then create a site you own, using the
   database's external URL from the Render dashboard:

   ```bash
   DATABASE_URL='<external URL>?sslmode=require' pnpm --filter @cms/api create-site -- \
     --name "Test" --time-zone Europe/Paris --locale en --owner-email you@example.com
   ```

   Reload the admin: it opens the site with the site switcher and the page tree.

## Planning files

Base is built with the [AI Blueprint](https://github.com/aiblueprinthq/ai-blueprint)
workflow, one reviewed feature at a time.

| File | What it holds |
| --- | --- |
| `blueprint/project-plan.md` | The full plan: problem, users and roles, features with PRD IDs, data, stack, pricing, UI, deployment, NFRs, core rules, metrics, milestones and gates, risks, open questions |
| `blueprint/build-plan.md` | 54 numbered features in build order across M0-M3 (v1) and v1.1, each tagged with its PRD story IDs |
| `blueprint/context/project-overview.md` | The compact overview agents read, with the plan fingerprint |
| `blueprint/history/` | The archived spec, findings and independent review of every completed feature |
