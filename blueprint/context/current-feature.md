# Feature: One app

**From build-plan:** feature 8
**Build attempt:** 1
**Branch:** feature/one-app
**Status:** verified

## Goal

Base runs as one Next.js app, `apps/web`:
- the admin is at `/admin`;
- the API is at `/api`, as route handlers (`/api/me`, `/api/sites/:siteId/tree`).

The handlers are written once against web-standard `Request`/`Response`. The same code serves
the Next.js route handlers, the admin's server components (called in-process, not over HTTP)
and the Fastify server, which leaves the default deploy and is kept for the Scale pack. One
Vercel deploy plus Supabase then runs Base for testing [FR-4.2, rule 15 / overview rule 13].

## In scope

- A new package, `packages/http` (`@cms/http`), holding:
  - the API router `handleApi(request, deps)`;
  - the `/api/healthz`, `/api/me` and `/api/sites/:siteId/tree` handlers;
  - the auth pieces moved out of `apps/api`: the `AuthAdapter` interface, the Clerk adapter,
    the bearer-token user check and the site-member check.

  The existing route tests move with them and run against `handleApi`.
- `apps/api` (Fastify) becomes a thin host: it forwards every `/api/*` request to
  `handleApi`. It leaves `pnpm dev` and the default deploy, but still builds, tests and starts.
- `apps/admin` is renamed to `apps/web` (`@cms/web`), with the admin pages under `/admin`:
  - sign-in moves to `/admin/sign-in`;
  - `/` redirects to `/admin` until Feature 24 renders the public site there;
  - every internal link and redirect moves to the new paths.
- A catch-all route handler `app/api/[...path]/route.ts` serves the API from the Next.js app.
- The admin's `lib/api.ts` calls `handleApi` in-process with the signed-in person's session
  token, so the app no longer needs `API_URL` or a separate API server.
- Docs and config:
  - `AGENTS.md` (Layout, Commands);
  - README;
  - `.env.example`;
  - the API section of `coding-standards.md`;
  - the Vercel root-directory change, which the user makes.

## Out of scope

- Supabase Auth (Feature 9); Clerk stays the only auth adapter here.
- Jobs and `/api/jobs/run` (Feature 10).
- The public website at `/` (Feature 24) and the Delivery API (Feature 26).
- API tokens, CORS, request bodies and write routes. Every route here is GET.
- Packaging the Fastify host as a `@base/scale-*` package and `API_URL` for a split deploy
  (Scale pack, Features 61-65).
- Moving `create-site` to a CLI. It stays `pnpm --filter @cms/api create-site`.
- Open findings F-10, F-11, F-13, F-14, F-18, F-24, F-25, F-26 and F-32. F-14's fix (a stable
  403 for a missing email) stays open. The new 500 shape below just stops the internal
  message from reaching the client.

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step, then present one feature-level review packet. This
feature moves the authentication boundary for every API route, so the `when-sensitive`
independent review will be selected before `/complete`.

## Build steps

- [x] 1. **`@cms/http`: the API written once.**
  - Create `packages/http` with `build`, `typecheck` and `test` scripts, following
    `packages/db`'s layout.
  - Move `AuthAdapter`, `Profile`, `UnverifiedEmailError`, `ClerkCalls`, `clerkCalls` and
    `clerkAuthAdapter` from `apps/api/src/auth.ts`, unchanged.
  - Rewrite `requireUser` and `requireSiteMember` as plain functions that return either the
    user or membership, or an error `Response`.
  - Add `handleApi(request, deps)`, which routes by method and path (see Data / contracts),
    and the three handlers.
  - Move `app.test.ts`, `tree.test.ts`, `auth.test.ts`, `test/fake-auth.ts`, `test/db.ts`
    and `test/global-setup.ts`. The tests call `handleApi(new Request(...))` with `/api/...`
    URLs and keep every existing assertion.
  - Add tests for:
    - 404 on an unknown path;
    - 405 with `Allow` on a wrong method;
    - 500 `internal_error`, without the message, when a handler throws (also passed to
      `deps.onError`);
    - 400 for a repeated or unknown query parameter;
    - `cache-control: no-store` on responses.

  **Done when:** `pnpm --filter @cms/http test` passes, with the moved tests' assertions
  unchanged apart from the paths, and `pnpm typecheck` passes.
- [x] 2. **Fastify becomes a thin host.**
  - `apps/api/src/app.ts` registers one catch-all for `/api/*` (every method). It builds a
    `Request` from the Fastify request (method, URL with query, headers) and sends back the
    `Response`'s status, headers and body.
  - Delete `src/routes/`, `src/auth.ts` and the moved tests.
  - `server.ts` imports the Clerk adapter from `@cms/http`.
  - Rename the `dev` script to `dev:fastify`, so `pnpm dev` no longer starts Fastify.
  - Fastify's `/healthz` becomes `/api/healthz`.
  - `bootstrap.ts` and `create-site` stay.

  **Done when:** a new `app.test.ts` uses `app.inject` with the fake adapter and shows:
  - `GET /api/healthz` returns 200;
  - `GET /api/me` returns 401 without a token and 200 for a valid token;
  - a tree request with a query string answers the same as `handleApi`;
  - an unknown path and a wrong method give 404 and 405.

  `bootstrap.test.ts` passes unchanged and `pnpm --filter @cms/api build` passes.
- [x] 3. **`apps/admin` becomes `apps/web` with the admin at `/admin`.**
  - `git mv apps/admin apps/web` and rename the package to `@cms/web`.
  - Move the pages: `app/page.tsx` → `app/admin/page.tsx`, `app/sites/` →
    `app/admin/sites/`, `app/sign-in/` → `app/admin/sign-in/`.
  - Add a new `app/page.tsx` that redirects to `/admin`.
  - Update every link and redirect: the site switcher, the header mark, not-found, the
    first-site redirect, and the server action import in `page-tree.tsx`.
  - `proxy.ts` protects `/admin(.*)` except `/admin/sign-in(.*)`. It no longer guards
    `/api`, whose handlers answer 401 themselves.
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL` becomes `/admin/sign-in`.

  **Done when:**
  - `pnpm --filter @cms/web typecheck`, `test` and `build` pass;
  - the build's route list shows `/`, `/admin`, `/admin/sign-in/[[...sign-in]]` and
    `/admin/sites/[siteId]`;
  - `grep` finds no `/sites/` link without the `/admin` prefix in `apps/web`;
  - no file outside the plans and history mentions `apps/admin`.
- [x] 4. **The API inside the app.**
  - `apps/web/lib/server-deps.ts` builds `{ db, auth }` once per server instance, lazily on
    the first request, so `next build` needs no environment:
    - `createDb(DATABASE_URL, { max: 5 })`, adding an optional `max` (pool size) to
      `createDb`;
    - `clerkAuthAdapter(clerkCalls(CLERK_SECRET_KEY))`.

    A missing variable throws an error that names the variable, never a value.
  - `app/api/[...path]/route.ts` exports GET, POST, PUT, PATCH and DELETE, each passing the
    request to `handleApi` with those deps.
  - `lib/api.ts` keeps `apiGet`, `getMe`, `ApiError` and the types. `apiGet` builds an
    in-process `Request` for `/api/...` with `Authorization: Bearer <session token>` and
    calls `handleApi` directly: no `fetch` and no `API_URL`.
  - The small pieces that need no Next.js import live in `lib/api-core.ts` (the in-process
    call and the `ApiError` mapping), so vitest can test them with fake deps.

  **Done when:** web tests show:
  - the in-process call returns the handler's JSON;
  - it maps a non-2xx answer to `ApiError` with status and code;
  - a missing `DATABASE_URL` gives an error naming it.

  Also: `pnpm --filter @cms/web build` passes without env, and `pnpm typecheck` passes.
- [x] 5. **Docs, config and final gate.**
  - `AGENTS.md` Layout and Commands: `apps/web`, `@cms/http`, Fastify as the Scale host,
    `/api/healthz`, dev URLs, the web env.
  - README.
  - `.env.example`: remove `API_URL`, update the sign-in URL, note that the web app needs
    `DATABASE_URL`.
  - `coding-standards.md`: the API section points at `@cms/http`.
  - `turbo.json`: `pnpm dev` runs the web app only.
  - README tells the user to set the Vercel project's root directory to `apps/web`, and
    which env vars it needs.

  **Done when:** `pnpm verify` passes and there is no migration drift.

- [x] 6. **Repair: Vercel build order and review findings F-37 to F-39.**
  - `apps/web/vercel.json` sets the build command to
    `cd ../.. && pnpm turbo run build --filter=@cms/web`, so Turborepo builds `@cms/db`
    and `@cms/http` before `next build` (their `dist/` is not committed). README and
    AGENTS.md say so.
  - F-37: `queryObject` uses a null-prototype object, so `__proto__` is an ordinary unknown
    key (400 `invalid_input`).
  - F-38: the catch-all route also exports OPTIONS and HEAD, so every method reaches
    `handleApi`.
  - F-39: the Fastify host stops parsing bodies (`removeAllContentTypeParsers` plus a
    catch-all parser that leaves the body alone), so a POST with any body gets the same 405
    as `handleApi`.

  **Done when:**
  - tests cover `?__proto__=x` (400) and a Fastify POST with invalid JSON and with
    `application/xml` (405 `method_not_allowed`);
  - `vercel.json` is valid JSON, and the build command, run from `apps/web` after deleting
    the `dist/` folders of `@cms/db` and `@cms/http`, rebuilds them and the app;
  - F-37 to F-39 are marked `fixed`;
  - `pnpm verify` passes.

## Files / areas

- `packages/http/` (new): `package.json`, `tsconfig*.json`, `vitest.config.ts`,
  `src/index.ts`, `src/auth.ts`, `src/router.ts`, `src/routes/{me,tree,healthz}.ts`,
  `src/*.test.ts`, `src/test/`
- `apps/api/src/app.ts`, `server.ts`, `app.test.ts`, `package.json`. Removed:
  `routes/`, `auth.ts`, `auth.test.ts`, `tree.test.ts`, `test/fake-auth.ts`.
- `apps/admin/` → `apps/web/`: `app/page.tsx`, `app/admin/**`,
  `app/api/[...path]/route.ts`, `lib/api.ts`, `lib/api-core.ts`, `lib/server-deps.ts`,
  `proxy.ts`, `components/site-switcher.tsx`, `components/tree/page-tree.tsx`,
  `app/not-found.tsx`, `package.json`
- `packages/db/src/index.ts`: the optional `max` for `createDb`
- `AGENTS.md`, `README.md`, `.env.example`, `blueprint/context/coding-standards.md`,
  `turbo.json`, `pnpm-lock.yaml`

## Data / contracts

**Deps.** `ApiDeps = { db: Db; auth: AuthAdapter; onError?: (error: unknown) => void }`.
`onError` defaults to `console.error`.

**Routes.** All JSON, `content-type: application/json`, `cache-control: no-store`:

| Method + path | Answers |
| --- | --- |
| GET `/api/healthz` | 200 `{ ok: true }`, no auth |
| GET `/api/me` | as today: 200 `{ user, memberships }`; 401 `unauthenticated`; 403 `email_not_verified` |
| GET `/api/sites/:siteId/tree?parentId=&after=&limit=` | as today: 200 `{ items, nextCursor }`; 401; 403 `forbidden`; 404 `not_found` (malformed site id); 400 `invalid_input`, `invalid_cursor`; 404 `parent_not_found` |
| any other path under `/api` | 404 `{ error: "not_found" }` |
| a known path with another method | 405 `{ error: "method_not_allowed" }`, `Allow: GET` |
| a handler throws | 500 `{ error: "internal_error" }`; the error goes to `onError`, never into the body |

**Decided during build.**
- JSON answers carry `content-type: application/json; charset=utf-8`. Fastify adds the
  charset when it sends a string body, so both hosts now send the same header.
- `@cms/db`'s `migrationsFolder` is built from path parts instead of
  `new URL("../drizzle", import.meta.url)`. Turbopack tried to resolve that URL as an asset
  when the web app imported the package, and the build failed.
- `apps/web/next.config.ts` loads the repo root `.env` with Node's `process.loadEnvFile`
  when it exists. Next.js reads only its own folder, and values the host sets still win.
  This keeps one `.env` for `pnpm dev`.
- `turbo.json` needed no change. With Fastify's script renamed to `dev:fastify`, `pnpm dev`
  starts only the web app.

**Query parsing.** It uses the URL's `searchParams`. A repeated key or an unknown key is 400
`invalid_input`, as Fastify's strict parse did. The site id is one path segment, decoded
with `decodeURIComponent`. A segment that fails to decode is 404 `not_found`.

**Auth** is unchanged: `Authorization: Bearer <token>` matching the existing pattern, then
`AuthAdapter.verify`. The first sight of a person creates their user once. The site-member
check runs after the user check.

**In-process admin calls.** `apiGet(path)` gets the Clerk session token as today. When
there is no token it throws `ApiError(401, "unauthenticated")`. Otherwise it calls
`handleApi(new Request(new URL(path, "http://base.internal")), deps)` with the bearer
header and parses the JSON. A non-2xx answer becomes `ApiError(status, body.error)`. The
token never reaches client JavaScript (server-only module).

**URLs.** The admin is at `/admin` (it redirects to the first site),
`/admin/sites/:siteId`, and the sign-in page `/admin/sign-in`. `/` redirects to `/admin` for
now.

**Env.**
- `apps/web` needs `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/admin/sign-in`.
- `API_URL` is removed from the default setup.
- `apps/api` still needs `DATABASE_URL` and `CLERK_SECRET_KEY`.

## Testing

`pnpm test` exists, so every logic step ships passing tests.

- **`@cms/http`:** integration tests against real Postgres (`TEST_DATABASE_URL`) through
  `handleApi`. These are the moved route tests plus the router cases. The Clerk adapter's
  unit tests move unchanged.
- **`@cms/api`:** a Fastify forwarding test with `app.inject`.
- **`@cms/web`:**
  - unit tests for the in-process client and the deps env check, with fake deps;
  - the existing tree-state tests;
  - `next build` proves the routes compile and appear.
- **Not automated:**
  - a browser sign-in through Clerk;
  - a real Vercel deploy.

  There are no Clerk keys or browser harness here. The user checks these on a Vercel
  preview after changing the root directory, using the handoff's try path.
- **Final gate:** `pnpm verify`. Last run on the same code as main 4f375c6, this session:
  pass with 199 tests.

## Notes for the AI

- **Same contract.** The moved tests keep their assertions, apart from the `/api` prefix.
  If one has to change, stop and say why.
- **Never leak.** No error message, stack, token or env value reaches a response body or
  log line, beyond what the `onError` default prints server-side.
- **One code path.** Route handlers, server components and Fastify all go through
  `handleApi`. Don't duplicate auth or route logic in `apps/web` or `apps/api`.
- **Runtime.** Route handlers run on the Node.js runtime (the default; `pg` needs Node).
  Don't add the Edge runtime.
- **Pool size.** `max: 5` keeps a serverless instance from taking a large share of the
  Supabase session pooler's connections. This is a reversible internal value.
- **Vercel.** The Vercel project's root directory must change from `apps/admin` to
  `apps/web`. Say this in the handoff; only the user can change it.
- **Moving files.** Use `git mv` so history follows.
