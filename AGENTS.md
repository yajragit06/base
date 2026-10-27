# AGENTS.md

Instructions for AI coding agents working in this project. This is the cross-tool
entry point. Codex, Google Antigravity, and OpenCode read `AGENTS.md`. Other
compatible tools do too. Claude Code reads `CLAUDE.md`, which imports this file,
so there is a single source of truth.

Claude Code, Codex, and every other AI tool must not add AI attribution to
commits or pull requests, including AI `Co-Authored-By` trailers or generated-by
signatures. Preserve genuine human attribution. See
[Commit and PR attribution](blueprint/context/ai-interaction.md#commit-and-pr-attribution)
for optional tool settings.

## What this is

**Base**, the tree-first CMS for developers, editors and AI agents. An MIT-licensed,
TypeScript, API-first CMS: MODX's resource tree, a schema-driven admin for editors, a typed
Delivery API and SDK for sites and apps, and permissioned AI agents over MCP. Paid add-ons
(AI pack, Team, Cloud) live in separate `@base/ee-*` packages. Product scope and build
order are in `blueprint/context/project-overview.md`; the full plan is
`blueprint/project-plan.md`. Code packages still use the `@cms/*` scope.

### Layout

- `apps/api` Fastify API. `src/app.ts` builds the app from injected `{ db, auth }`
  (`buildApp`, testable with `app.inject` and a fake `AuthAdapter`); `src/server.ts` wires
  Postgres and Clerk. `src/auth.ts` holds the `AuthAdapter` interface, the Clerk adapter and
  `requireUser`, which turns `Authorization: Bearer <token>` into `request.user` or a 401,
  and `requireSiteMember`, which guards `/sites/:siteId/...` routes (404 for a malformed id,
  403 for anyone without a role on the site, so site existence never leaks). Routes live in
  `src/routes/`: `GET /me`, and `GET /sites/:siteId/tree?parentId=&after=&limit=` (one page
  of children with `hasChildren`, any role; `listChildrenPage` in `@cms/db`).
- `apps/admin` Next.js (App Router) admin app: Clerk sign-in (`proxy.ts` protects every page
  but `/sign-in`), shadcn/ui components with Tailwind CSS 4 (`components/ui`, add only what
  a screen uses), and the shell under `/sites/[siteId]` with the site switcher and the page
  tree (`components/tree`; its state and keyboard logic is pure and unit-tested). Admin
  URLs carry the site: `/sites/:siteId/...`. Server components and server actions call the
  API through `lib/api.ts` with the Clerk session token; the admin never reads the
  database, and the token never reaches client JavaScript.
- `packages/db` Drizzle schema (`src/schema.ts`), migrations in `drizzle/`, `createDb`;
  sites and domains (`sites.ts`), the entry tree (`entries.ts`), immutable versions
  (`versions.ts`: one linear chain per entry and locale, the latest is the one nothing is
  based on; a trigger rejects deletes and every change but `status`), `DbError` codes, and
  `withSite()`, which every site-scoped query runs inside: it switches to the `cms_app`
  role so row-level security applies, even when connected as a superuser.
- `packages/schema` `defineContentType`, `defineBlock`, the `field` builders, `EntryData`
  and `validateEntry` (field-level errors with stable codes).
- `packages/core` the write path: `defineCommand` and `runCommand` (Zod input, an
  `Authorizer` check, then the change and its `audit_log` row in one transaction),
  `CommandError`, and the commands `site.create`, `site.addDomain`, `entry.create` (records
  the actor as creator) and `entry.saveDraft` (validates data against the entry's content
  type, appends a draft; Authors may save only on entries they created). `entry.saveDraft`
  fails with `forbidden`, `entry_not_found`, `invalid_locale`, `unknown_content_type`,
  `invalid_input` (field errors under `data`), `version_not_found` or `version_conflict`
  (the base is no longer the latest version). Content types reach commands as
  `CommandDeps.contentTypes`, available to handlers as `ctx.contentTypes`. Every
  new write is a command run through `runCommand`; the `@cms/db` write functions are its
  building blocks, not a second write path. `roleAuthorizer(db)` checks the user's role on
  the command's site against `PERMISSIONS` (`src/permissions.ts`): system actors are
  allowed, agents denied until API tokens exist, and a permission missing from the table
  is denied. Add a row there for every new command. `membership.grant` assigns roles; only
  an Owner grants or changes the Owner role, and a site always keeps one Owner.
- Further apps and packages (worker, SDK, CLI, MCP, site starter) are
  added by the build-plan feature that first needs them.

### Rules that must not break

1. No code is stored in or executed from the database. Content types, fields, hooks,
   blocks and extensions are TypeScript in Git.
2. Versions are immutable. Edits create versions; restore creates a new draft.
3. Drafts reach the Delivery API only with a valid, unexpired preview token.
4. Every write is a typed Zod command with a permission check and an audit entry (actor
   type user, agent or system) in the same transaction. UI, Admin API, CLI and MCP share
   it; there is no other write path.
5. Permissions and site isolation are enforced in the core: every tenant query filters
   by `site_id` (backed by row-level security). Each new route ships a forbidden-path
   test and a cross-site test.
6. A move or slug change rebuilds descendant URIs and writes 301 redirects in the same
   transaction.
7. AI writes drafts only unless the site enables agent publishing; output is validated
   against the schema (retry once, never saved partially), budgeted, and logged with
   model, prompt template id, token counts and diff. Private fields never go to a model.
8. AI runs on each site's own provider keys in v1. Keys, webhook secrets and other
   secrets are sealed at rest and never returned by the API or written to the audit log;
   tokens and preview links are stored hashed.
9. Schema changes that affect stored data need a version bump, a migration function and a
   dry-run count before apply.
10. Jobs are idempotent with deterministic ids; webhooks are HMAC-signed and retried.
11. Database migrations are forward-only and must work with the previous release's code.
12. The core never imports `@base/ee-*` packages.

This project is built with the **AI Blueprint**, a workflow layer, not an
app skeleton. To start a new project, scaffold the app first in an empty folder
(create-next-app, Vite, etc.), then overlay these files on top. Never run a
framework scaffolder inside a directory that already holds the blueprint files
(`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `blueprint/`); it fails
because the directory isn't empty.

The workflow is defined by the local skills and context files below.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, native platform features,
and installed dependencies before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: untrusted
  input, auth/session/ownership, shared persisted data, destructive operations,
  payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, or project rules.
- Stack-specific template standards apply only when the project uses that stack.

## Read these when relevant

- `blueprint/config.json` - deterministic project workflow settings
- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - read before changing code
- `blueprint/context/ai-interaction.md` - read when running the Blueprint workflow
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built in this checkout

Reuse relevant context already loaded in the session. Claude Code imports only
this file; its Blueprint skills load the other files on demand.

## Project configuration

`blueprint/config.json` is the user-owned, machine-readable workflow policy for
this project. Workflow skills read the relevant settings before acting. A
missing file means built-in defaults. An invalid file falls back to defaults for
read-only status reporting, but mutating workflow commands stop and point to
`/doctor` instead of guessing.

Configuration can make review or verification stricter and can tune local
branch names and automated-mode limits. It never grants permission to commit,
merge, push, deploy, publish, send, delete data, waive a failing check, or accept
a finding. Those approval and safety boundaries are not configurable.

`qualityGates.regular` controls automatic audit, independent-review, check, and
try-guide behavior for the normal workflow and Autopilot.
`qualityGates.continuous` controls the same per-feature gates for Continuous
Mode. The existing `tryGuide` keys select `/check guide`, which generates
instructions without performing verification or recording acceptance.
Independent review defaults to `when-sensitive` in both workflows, while
audit and check default to `manual`. Try guide defaults to `when-testable`,
which generates one small `## Try it now` demonstration only when the work has
a safe, meaningful direct observation path. Sensitive or unusually broad work
therefore selects independent review automatically; ordinary small work does
not. Setting a workflow's independent review to `manual` disables that automatic
selection, while an explicit `/audit independent current` remains available.
The other conditional modes are `when-sensitive` for audit, `when-behavioral`
for check, and `when-user-facing` for try guides. Existing `manual`, `always`,
and `when-user-facing` try-guide policies remain supported.

`review.independentExecution` controls how a selected independent-review gate
runs. Its default, `automatic`, uses a fresh isolated reviewer child when the
active adapter can prove isolation, exact reviewer identity and model, and
completion. Otherwise it preserves the request and falls back to the manual
handoff. This setting changes execution only; the quality-gate policy still
decides whether review is selected.
The automatic path spawns a generic child through the current runtime and gives
it the installed project-local Audit skill and review contract. It never requires
or discovers global agent roles, skills, prompts, or TraversyFlow components.
New review requests record requested execution and completed receipts record
actual execution. Manual uses `fresh session`; automatic uses `fresh subagent`;
an explicit automatic fallback records actual manual with `fresh session`.

`git.landing` controls only how `/complete` offers to land finished regular
work. Its default, `local-merge`, keeps the local squash-merge flow. Set it to
`pull-request` when completed branches should be pushed and opened as pull
requests for provider review and squash merge. Configuration never supplies the
required push, pull-request, or merge approvals. Continuous Mode remains
local-only and ignores this setting.

New projects default to one review packet after all small implementation steps
(`workflow.stepReview: "feature"`) with step checkpoint commits disabled. This
keeps the normal loop reviewable without repeating the full session context after
every step. Set `stepReview` to `every` when teaching, pairing closely, or working
on a high-risk change. That restores the per-step approval pauses. To fully
restore the previous workflow, including optional checkpoint prompts after an
approved step, also set `checkpointCommits` to `enabled`. Onboarding presents
these pairs as Efficient and Guided choices, but stores only the two low-level
settings. They can be changed at any time. Both styles end with an optional
read-only code walkthrough. Review cadence controls approval pauses, not whether
the user can ask for an explanation of the finished implementation.

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. Each step's instructions
are plain markdown skills any capable agent can read and follow. The workflow is
exposed through tool-specific adapters:

- Codex: `.agents/skills/<skill>/SKILL.md`
- Claude Code: `.claude/skills/<skill>/SKILL.md`
- GitHub Copilot: `AGENTS.md` plus `.agents/skills/<skill>/SKILL.md`
- Google Antigravity: `AGENTS.md` plus `.agents/skills/<skill>/SKILL.md`
- OpenCode: `AGENTS.md` plus the compatible `.agents/skills/` or
  `.claude/skills/` tree already installed for the selected tools

Unused adapters can be removed. Codex and GitHub Copilot share `.agents/`, and
Google Antigravity uses that tree too. OpenCode can reuse `.agents/` or
`.claude/`. Projects without Claude Code can delete `CLAUDE.md` and `.claude/`.
Claude Code-only projects can delete `.agents/`, but should keep `AGENTS.md`
because `CLAUDE.md` imports it. Do not create `.opencode/skills/` or an
Antigravity-specific skill tree. Both tools use the supported shared trees.

When changing shared workflow behavior, update the matching skill in both
adapter folders so every supported tool stays aligned.

### Parallel work

Blueprint supports parallel work through isolated Git checkouts, without a
separate team mode. Give each developer or agent its own clone or Git worktree
and one dedicated branch before starting `/feature` or `/fix`. The branch must
use the configured prefix and the work item's lowercase kebab-case title. Each
checkout keeps its own
`blueprint/context/current-feature.md`, findings, and review state. Never run two
active work items in the same working directory or replace another worker's
active spec.

Parallel branches may both update `blueprint/build-plan.md`; resolve any normal
Git conflict when the later branch lands. Use `git.landing: "pull-request"` when
the default branch is protected or several isolated checkouts are active. This
model intentionally does not add per-item state folders or automatic agent
coordination.

Learn the feature loop: `/feature` -> `/implement` -> `/check` -> `/audit current` ->
`/complete`. Approve the Feature spec before Implement. Check proves behavior;
Audit reviews code and records findings. Showing both in this path does not
change configured gates or make Audit mandatory. `/check guide` only generates
manual instructions and never performs verification or records acceptance.

Core skills:

### Build

- `feature` - turn a build-plan item into a spec, or propose a reviewed plan addition for a genuinely new feature
- `implement` - build the current spec one small, reviewed step at a time
- `check` - prove the current spec against the running app, or use `check guide`
  for a read-only manual review guide: where to go, what to click, what to expect
- `complete` - run the final safety pass, log features, fixes, or rollbacks under `blueprint/history/`, then request approval for the configured local merge or pull-request landing

### Understand and review

- `explore` - investigate an idea against the actual code without writing files or requiring plans
- `brief` - read-only briefing on an upcoming build-plan feature (scope, dependencies, size) before you spec it
- `status` - read-only progress summary, workflow drift warning, and suggested next action
- `debug` - reproduce and isolate a failure without editing code, then hand the evidence to `fix` or `implement`
- `audit` - branch-aware or full-project review across all concerns or a focused quality, security, performance, or tests lens; `audit independent current` prepares an immutable checkpoint for a fresh reviewer session or configured isolated reviewer child; records findings in `blueprint/context/findings.md` and independent receipts in `blueprint/context/review.md`, where blocking findings or stale review state stop `complete`
- `doctor` - Blueprint health check for setup, adapters, plans, overview freshness, dashboard state, and workflow drift; it may offer to reset only malformed generated dashboard state after approval

### Plan and set up

- `onboard` - tune commands, standards, visibility, ignore rules, and tool adapters after overlaying the Blueprint onto a freshly scaffolded or early project
- `adopt` - bootstrap the Blueprint into an existing brownfield app with shipped features
- `discovery` - optional deep, multi-turn planning conversation that drafts the two user-owned plans only after review and approval; direct plan writing remains fully supported
- `overview` - distill the two planning docs into
  `blueprint/context/project-overview.md`, then offer a reviewed initial planning
  baseline commit before Feature 1
- `prototype` - optional, pre-build static mockups to lock the look
- `tests` - set up unit testing by default, or a repeatable browser harness with `tests browser`
- `ci` - explicitly set up one project-specific Verify command and matching automatic GitHub checks, with an optional local pre-push hook

### Recover and release

- `fix` - document an ad-hoc bug or change into `blueprint/context/current-feature.md`
- `rollback` - plan a safe reversal of a completed feature from its archive and exact git commit, with later-dependency review before code changes
- `release` - optional Render or Vercel deployment readiness, local config, env review, and smoke-test planning

In Codex, invoke these as skills (`$onboard`, `$discovery`, `$overview`, `$feature`,
`$implement`, and so on) or ask naturally, such as "run the overview." In Claude
Code and Google Antigravity, use slash commands such as `/onboard` or `/feature`.
These are AI chat commands, not terminal commands. In OpenCode or other tools
without a dedicated invocation syntax, ask the agent to run the matching skill
or follow its `SKILL.md` manually. The
conventions in `blueprint/context/` apply however a step is invoked. `/discovery`
is never required: users may write detailed plans directly or develop them
through any conversation before running `/overview`.

### Automation

Optional explicit-only skill: `autopilot` combines `feature` or `fix` with
`implement` in one bounded pass when directly invoked, including the configured
regular quality gates. The normal workflow stops for human approval of the spec
before implementation; Autopilot continues through that review point. It may
create checkpoint commits on the feature or fix branch after passing steps and
repair confirmed P0/P1 findings when its audit gate runs. It stops before
`/complete`, merge, push, deploy, or destructive actions.

Optional explicit-only skill: `continuous` can resume or select the next planned
feature and repeat the complete local feature lifecycle through the configured
limit or end of the build plan. It creates one branch and one local main commit
per feature, applies the Continuous quality gates, archives and merges serially,
and stops on decisions or failed safety gates. It never pushes, deploys,
publishes, sends, or performs destructive actions.

Deployment is also explicit. `/release` can prepare local Render or Vercel config
and run readiness checks, but it must stop before deploy, remote service changes,
push, or publish unless the user gives a separate yes in the current chat.

## Dashboard activity

The dashboard can show the active or most recent substantial Blueprint command
from `blueprint/.state/run.json`. This file is generated local state, ignored by
Git, and never part of a feature commit.

Commands with meaningful progress or a durable handoff should write it when the
state directory exists: `onboard`, `adopt`, `discovery`, `overview`, `feature`,
`fix`, `rollback`, `implement`, `debug`, `check`, `audit`, `tests`,
`ci`, `prototype`, `autopilot`, `continuous`, `complete`, and
`release`. Short orientation commands such as `explore`, `brief`, `status`, and `doctor`
do not write activity state. The `check guide` mode also never writes activity
state; select the Check mode before any activity call. Doctor's optional
approved reset removes malformed activity instead of recording another run.

Writing the initial activity record is the first action of a tracked command,
before project inspection, preflight, or other tool calls. This one generated
state write does not authorize product changes or bypass any safety check.

Never create or edit `run.json` directly. From the project root, use the first
helper that exists:

```text
node .agents/skills/doctor/scripts/run-state.mjs <action> <options>
node .claude/skills/doctor/scripts/run-state.mjs <action> <options>
```

Start with `start --command <skill> --summary <truthful-summary> --boundary
<boundary>`. Use `update` at meaningful milestones or for a blocker, with
`--status blocked` and `--resume <exact-command>` when recovery is needed. End
with `finish --status ready|completed --summary <truthful-summary>`. The helper
validates every field before atomically replacing the generated file. If it is
missing or fails, report the activity warning and continue the workflow without
writing a manual fallback.

The helper writes this schema:

```json
{
  "schemaVersion": 1,
  "command": "continuous",
  "status": "running",
  "summary": "Completing the remaining build plan",
  "detail": "Implementing feature 3.",
  "boundary": "local-only",
  "startedAt": "<ISO-8601 timestamp>",
  "updatedAt": "<ISO-8601 timestamp>",
  "resumeCommand": "/continuous resume",
  "progress": { "current": 2, "total": 5, "label": "features" },
  "feature": { "id": "3", "title": "Export reports" }
}
```

`status` must be `running`, `blocked`, `ready`, or `completed`. Use `ready` when
the command reached its intended review handoff, such as Autopilot waiting for
review before `/complete`. Use `blocked` with the exact recovery command when
work can resume. `boundary` must be `read-only`, `reviewed`, or `local-only`.
The progress, feature, detail, boundary, and resume fields are optional. Never
put secrets, raw logs, prompts, or user content in this file. Activity tracking
must not change a command's approval boundaries or turn a reporting failure into
a workflow failure.

## Automatic verification

Automatic GitHub checks are a separate explicit setup. `/onboard` and `/adopt`
only report existing checks and point to `/ci` or `$ci` when none exist. Running
`/ci` inspects the real project and defines one `Verify` command from checks that
already exist. Use this order when available: typecheck, tests, then build. Never
invent a test runner or another check just to fill the command.

For JavaScript and TypeScript projects, prefer a package script such as `verify`
and use the detected package manager. For other stacks, use the native task
runner or exact combined command. Record the exact command under Commands below.

The optional `.github/workflows/verify.yml` must run that same command for pull
requests and pushes to the default branch. Preserve existing workflows, use the
project's real runtime and install command, and grant only `contents: read` by
default. This setup does not add coverage, browser tests, security scans, or
version matrices; those remain later project choices. A local pre-push hook that
runs the same `Verify` command is offered as an opt-in at the end of `/ci`, and
`git push --no-verify` still bypasses it, so the remote ruleset stays the lock.

GitHub branch protection or a ruleset can require the check after the repository
is pushed, but that is a separate remote setting. Missing automatic GitHub
checks do not make the Blueprint unusable.

## Commands

pnpm 9 workspaces with Turborepo. Copy `.env.example` to `.env` first.

- Install: `pnpm install`
- Local services: `pnpm infra:up` (Postgres 16 + pgvector, Redis in Docker); `pnpm infra:down`
- Dev servers: `pnpm dev` (API http://localhost:4000, `GET /healthz`; admin http://localhost:3000)
- Build: `pnpm build`
- Production servers: `pnpm --filter @cms/api start`, `pnpm --filter @cms/admin start`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint` (Biome); format and safe fixes: `pnpm format`
- Test: `pnpm test` (Vitest; suites run one at a time). `@cms/db` and `@cms/core` tests need
  `TEST_DATABASE_URL` exported (a disposable database: tests truncate every table) and
  a database user allowed to create roles.
- Database user: the app must connect as the same user that runs `pnpm db:migrate`; the
  migration grants the `cms_app` role (needed by `withSite()` and `withUser()`) only to
  that user.
- API env: `CLERK_SECRET_KEY` is required; the API refuses to start without it.
- Admin env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the same Clerk
  instance, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, and `API_URL` (default
  `http://localhost:4000`). The admin builds without them; pages render per request.
- Verify: `pnpm verify` (typecheck, lint, test, then build)
- New site: `pnpm --filter @cms/api create-site -- --name <name> --time-zone <Area/City>
  --locale <tag> --owner-email <email>` (system only; the owner must have signed in once)
- Migrations: `pnpm db:generate` after editing `packages/db/src/schema.ts` (commit the
  generated migration), `pnpm db:migrate` to apply

GitHub checks: `.github/workflows/ci.yml` runs typecheck, lint, migrations on an empty
database, a schema/migration drift check, tests and build on pull requests and pushes to
`main`.

Browser testing is opt-in. Run `/tests browser` to add a harness and document its exact
command here as `Browser tests`.
