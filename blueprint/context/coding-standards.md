# Coding Standards

> Tuned by `/onboard` to this repository: a pnpm + Turborepo TypeScript monorepo with a
> Next.js app (admin and API), a shared web-standard API package and Drizzle on PostgreSQL. Edit freely as conventions
> settle; `TODO` marks choices the code has not made yet.

## TypeScript

- Strict mode, plus `noUncheckedIndexedAccess` (see `tsconfig.base.json`)
- ESM everywhere (`"type": "module"`); Node packages use `NodeNext` resolution, so
  relative imports end in `.js`
- No `any`; use proper types or `unknown`
- Infer where obvious; export explicit types for public package APIs

## Monorepo

- Apps in `apps/*`, shared code in `packages/*`, scope `@cms/*` until the product is named
- Workspace dependencies use `workspace:*`; packages build to `dist/` with `tsc` and
  expose `main`/`types` from there
- Add a new app or package only when a build-plan feature needs it, with `build`,
  `typecheck` and (if it has logic) `test` scripts so Turborepo picks it up
- The core never imports paid `ee-*` packages; they plug into extension points

## API (`@cms/http`)

- The API is written once in `packages/http` against web-standard `Request`/`Response`:
  `handleApi(request, deps)` takes injected `{ db, auth }`. The Next.js route handler,
  server components (in-process) and the Scale pack's Fastify host all call it
- Routes live in `packages/http/src/routes/`, one file per area, registered in
  `src/router.ts`; answer with `json(status, body)`
- Every write goes through a typed command: Zod input, permission check, audit entry in
  the same transaction (see the rules in `AGENTS.md`)
- Validate every request body, query and param with Zod; return field-level errors
  as `400` with a stable shape
- Errors: return a stable `{ error: code }`; unexpected errors become 500
  `internal_error`. Never leak stack traces, messages or secrets in responses

## Database (Drizzle)

- Schema in `packages/db/src/schema.ts`; generate migrations with `pnpm db:generate` and
  commit them. Never edit an applied migration
- Migrations are forward-only and must work with the previous release's code (add
  columns first, drop them in a later release)
- Every tenant table has `site_id`; every query filters by it, including updates and
  deletes, and row-level security backs it up
- Money-like or very large integers are never converted with `Number()`
- Inserts that may repeat (jobs, webhooks) use `onConflictDoNothing` on a dedupe key

## Web app (Next.js)

- App Router, server components by default; `'use client'` only for interactivity
- Server components call the API in-process through `lib/api.ts` (never the database
  directly for tenant data)
- Styling and component kit: `TODO` (shadcn/ui suggested in the plan). No inline styles
  once it is chosen
- Rich text editor: `TODO` (Tiptap or Lexical), stored as structured JSON
- Keyboard accessible and WCAG 2.1 AA; responsive down to tablet width

## Naming

- Components: PascalCase (`EntryEditor.tsx`)
- Other files: kebab-case (`content-tree.ts`)
- Functions and variables: camelCase; constants: SCREAMING_SNAKE_CASE
- Types: PascalCase, no prefix
- Database columns: snake_case; TypeScript fields: camelCase

## Validation and errors

- Zod at every trust boundary: HTTP input, command input, webhook bodies, AI output,
  environment variables
- Fail loudly in development (unknown blocks, invalid schemas); return safe messages in
  production

## Testing

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding: Vitest (`pnpm test`, which is on, so tests are a gate for logic-bearing
steps). Database code is tested against real Postgres via `TEST_DATABASE_URL`, never a
mocked database. External services (Clerk, Anthropic, Voyage, R2, Resend) are faked
through their adapter interfaces. Use `vi.useFakeTimers()` for time-dependent logic and
`app.inject` for API routes.

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- Browser automation is separately opt-in through `/tests browser`. That setup
  reuses a compatible runner or prefers Playwright for supported projects, then
  documents the exact command as `Browser tests` in `AGENTS.md`.
- When `Browser tests` is declared, add focused coverage for stable behavioral
  done-whens when it is proportionate, and run the documented command during
  `/check`. Do not assume it proves visual fidelity, real authenticated-profile
  behavior, browser chrome, or another claim the test does not observe.
- If no Browser tests command is declared, do not add a runner silently in the
  middle of an unrelated feature. Use the available dev server, browser
  screenshots, build output, API output, or manual evidence instead.
- Browser tests are not part of the default Verify command or CI unless the user
  separately chooses that slower gate.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
