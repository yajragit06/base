# MODX-style CMS Framework

An MIT-licensed, TypeScript, API-first CMS framework with MODX's resource tree, a
schema-driven admin for editors, and permissioned AI agents over MCP. The product name is
not decided yet; `<name>` stands for it in the plans.

No application code exists yet. This repository holds the planning files, in the
[AI Blueprint](https://github.com/aiblueprinthq/ai-blueprint) `blueprint/` structure,
converted from the "Modern MODX-style CMS Framework PRD (Open-core edition)".

| File | What it holds |
| --- | --- |
| `blueprint/project-plan.md` | The full plan: problem, users and roles, features with PRD IDs, data, stack, pricing, UI, deployment, NFRs, core rules, metrics, milestones and gates, risks, open questions |
| `blueprint/build-plan.md` | 54 numbered features in build order across M0-M3 (v1) and v1.1, each tagged with its PRD story IDs |
| `blueprint/context/project-overview.md` | The compact overview `/overview` would generate, with the plan fingerprint |
| `blueprint/config.json`, other `context/` and `history/` files | Blueprint defaults and stubs |

## Next steps

1. Settle the TODOs in `blueprint/project-plan.md` section 13; several change Features 1-5.
2. Scaffold the monorepo in this repository (Blueprint is an overlay, not a starter).
3. Run `pnpm dlx create-ai-blueprint@latest` and pick your adapters. If it replaces
   `blueprint/project-plan.md` or `blueprint/build-plan.md` with its stubs, restore them
   with `git checkout -- blueprint/project-plan.md blueprint/build-plan.md`.
4. Run `/onboard`, then `/overview` (regenerates the overview and fingerprint), then `/feature`.
