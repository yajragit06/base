# MODX-style CMS Framework

An MIT-licensed, TypeScript, API-first CMS framework with MODX's resource tree, a
schema-driven admin for editors, and permissioned AI agents over MCP. The product name is
not decided yet; `<name>` stands for it in the plans.

The monorepo is scaffolded; no features are built yet. The planning files use the
[AI Blueprint](https://github.com/aiblueprinthq/ai-blueprint) `blueprint/` structure,
converted from the "Modern MODX-style CMS Framework PRD (Open-core edition)".

## Layout

- `apps/api` Fastify API. `src/app.ts` builds the app (`buildApp`), `src/server.ts` listens.
- `apps/admin` Next.js admin app.
- `packages/db` Drizzle schema (`src/schema.ts`), migrations in `drizzle/`, `createDb`.

More apps and packages (worker, SDK, CLI, MCP server, site starter) arrive with the
build-plan features that need them. Packages use the placeholder scope `@cms/*` until
the product is named.

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

## Planning files

| File | What it holds |
| --- | --- |
| `blueprint/project-plan.md` | The full plan: problem, users and roles, features with PRD IDs, data, stack, pricing, UI, deployment, NFRs, core rules, metrics, milestones and gates, risks, open questions |
| `blueprint/build-plan.md` | 54 numbered features in build order across M0-M3 (v1) and v1.1, each tagged with its PRD story IDs |
| `blueprint/context/project-overview.md` | The compact overview `/overview` would generate, with the plan fingerprint |
| `blueprint/config.json`, other `context/` and `history/` files | Blueprint defaults and stubs |

## Next steps

1. Settle the TODOs in `blueprint/project-plan.md` section 13; several change Features 1-5.
2. Run `pnpm dlx create-ai-blueprint@latest` and pick your adapters. If it replaces
   `blueprint/project-plan.md` or `blueprint/build-plan.md` with its stubs, restore them
   with `git checkout -- blueprint/project-plan.md blueprint/build-plan.md`.
3. Run `/onboard`, then `/overview` (regenerates the overview and fingerprint), then `/feature`.
