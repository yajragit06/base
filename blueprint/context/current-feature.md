# Feature: Admin shell and tree

**From build-plan:** feature 6
**Build attempt:** 1
**Branch:** feature/admin-shell-and-tree
**Status:** draft

## Goal

Editors sign in to the admin app with Clerk and land in the shell: a site switcher at the
top, the site's page tree on the left and the selected area on the right. The tree loads
children only when a node is expanded, pages long child lists, and stays fast at 5,000
nodes [B1, FR-3.1]. It is calm, keyboard-first and WCAG 2.1 AA, in the spirit of MODX's
manager.

## Decisions confirmed for this feature

- **UI kit:** shadcn/ui components with Tailwind CSS (confirmed by the user; recorded in
  `project-plan.md` section 5 and the overview).
- **Site in the URL (proposed here, review it):** admin pages live under
  `/sites/:siteId`, so links and browser tabs keep their site. `/` sends a signed-in person
  to their first site. Later screens follow suit (`/sites/:siteId/entries/:id`,
  `/sites/:siteId/settings/...`) instead of the plan's assumed site-less `/entries/:id`.

## In scope

- `@cms/db`: a paged child listing with a `hasChildren` flag per node.
- `apps/api`: `GET /sites/:siteId/tree`, readable by every role on the site.
- `apps/admin`: Tailwind and shadcn/ui; Clerk sign-in (provider, route protection, a
  sign-in page); a server-side API client that sends the Clerk session token; the shell
  with the site switcher and the tree; the product name "Base" in the title.
- Admin unit tests for the tree's state and keyboard logic (Vitest, as in the packages).

## Out of scope

- Tree search, status dots and drag handles (status needs publishing, Feature 9; moving is
  Feature 8). The dashboard panel shows only a heading and a "select a page" prompt.
- The entry editor and entry routes (Feature 7); creating entries from the UI.
- Settings screens, invitations (Feature 12), subtree-aware hiding (Feature 13).
- A browser test harness (`/tests browser` is opt-in) and a dev mode that skips Clerk.
- Open findings F-10, F-11, F-13, F-14, F-15 and F-18.

## Build loop

Efficient style from `blueprint/config.json` (`stepReview: "feature"`, checkpoint commits
disabled). Build and verify each step, then present one feature-level review packet. The
new route reads tenant data behind sign-in, so the `when-sensitive` independent review will
be selected before `/complete`.

## Build steps

- [ ] 1. **Paged children in `@cms/db`.** `listChildrenPage(db, siteId, parentId,
  { after?, limit? })` returns `{ items, nextCursor }` in tree order, each item with
  `hasChildren`, using keyset paging on `(sort_order, id)` and the existing
  `entries_site_parent_idx`.
  **Done when:** integration tests page through 5,000 children of one parent (and 5,000
  top-level entries) and get every entry exactly once in order; `hasChildren` is right for
  leaf and parent nodes; an unknown parent or another site's parent returns
  `parent_not_found`; another site's entries never appear; and an `EXPLAIN` test on a
  5,000-entry site shows no sequential scan of `entries`.
- [ ] 2. **`GET /sites/:siteId/tree`.** A `requireSiteMember` pre-handler (after
  `requireUser`) loads the caller's membership on the site; the handler calls
  `listChildrenPage`.
  **Done when:** `app.inject` tests prove 401 without a token; 403 for a non-member and
  for a member of another site (cross-site); 200 for a Viewer; 404 for an unknown or
  malformed site id and for a parent outside the site; 400 for a bad cursor or limit;
  and paging returns `nextCursor` until the last page.
- [ ] 3. **Admin foundation.** Add Tailwind CSS 4 and shadcn/ui (`components.json`,
  `lib/utils.ts`, only the components used); `@clerk/nextjs` with `ClerkProvider`, a
  `proxy.ts` that protects every route except `/sign-in`, and `/sign-in/[[...sign-in]]`;
  `lib/api.ts`, a server-only client that calls `API_URL` with `Authorization: Bearer`
  from Clerk's `auth().getToken()`; `/` redirects to the first site from `GET /me`, or
  shows the no-sites empty state. Check the installed Clerk and Next 16 APIs (`proxy.ts`,
  `clerkMiddleware`) before writing them, and pin versions.
  **Done when:** `pnpm --filter @cms/admin typecheck` and `build` pass without Clerk keys
  (pages render dynamically, so nothing needs keys at build time), `.env.example` lists
  the new variables, and the page title is "Base".
- [ ] 4. **Shell, site switcher and tree.** `/sites/[siteId]` layout: a header with the
  product mark, the site switcher (sites from `/me`) and Clerk's user button; a tree pane
  and a main pane. The tree is a client component fed by server actions that call the
  tree route: lazy children on expand, "Show more" for `nextCursor`, and the states below.
  **Done when:** admin Vitest tests cover the tree state (expand, collapse, append a page,
  loading and error per node) and keyboard moves (Up, Down, Right to expand or enter,
  Left to collapse or go to the parent, Home, End, Enter to select); `typecheck` and
  `build` pass; and a 403 or 404 from the API shows the not-found page, not a crash.
- [ ] 5. **Docs and final gate.** Document the route, the admin env vars and the
  site-scoped URL rule in `AGENTS.md`.
  **Done when:** `pnpm verify` passes and there is no migration drift.

## Files / areas

- `packages/db/src/entries.ts`, `src/index.ts`, `src/entries.test.ts`
- `apps/api/src/routes/tree.ts` (new), `src/auth.ts` (`requireSiteMember`), `src/app.ts`,
  `apps/api/test` or `src/*.test.ts`
- `apps/admin`: `package.json`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`,
  `app/sign-in/[[...sign-in]]/page.tsx`, `app/sites/[siteId]/layout.tsx` and `page.tsx`,
  `app/not-found.tsx`, `proxy.ts`, `components.json`, `components/ui/*`,
  `components/site-switcher.tsx`, `components/tree/*`, `lib/api.ts`, `lib/utils.ts`,
  `vitest.config.ts`
- `.env.example`, `AGENTS.md`

## Data / contracts

**`listChildrenPage`** - `parentId: string | null` (null = top level); `limit` default 100,
clamped to 1..200; `after` is the previous page's `nextCursor`. Items are
`{ id, parentId, slug, uri, typeKey, sortOrder, hasChildren }`, ordered by `sort_order`
then `id`. `nextCursor` is null on the last page; it is base64url JSON
`{ s: sortOrder, i: id }`, and anything else fails with `invalid_cursor` (new
`DbErrorCode`). An unknown parent, or one in another site, fails with `parent_not_found`.
Read inside `withSite`, filtered by `site_id`; `hasChildren` is an `EXISTS` on the same
index.

**`GET /sites/:siteId/tree?parentId=&after=&limit=`**

| Case | Response |
| --- | --- |
| Signed in, any role on the site | 200 `{ items: [...], nextCursor: string \| null }` |
| No or bad token | 401 `{ error: "unauthenticated" }` |
| Not a member of this site | 403 `{ error: "forbidden" }` |
| Site id not a UUID, or no such site | 404 `{ error: "not_found" }` (checked before membership only for malformed ids; a well-formed unknown id is 403, so site existence does not leak) |
| `parentId` not in this site | 404 `{ error: "parent_not_found" }` |
| Bad `after` or `limit` | 400 `{ error: "invalid_cursor" }` or `{ error: "invalid_input" }` |

Reads are not commands (rule 4 covers writes), so nothing is audited. The query string is
validated with a Zod strict object.

**Admin env vars:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (admin
server), `API_URL` (default `http://localhost:4000`). Signed-out visits redirect to
`/sign-in`; after sign-in Clerk returns to `/`.

**Tree UI states** (per node and for the top level): loading (spinner with
`aria-busy`), loaded, empty top level ("No pages yet"), error ("Couldn't load. Retry"
button, announced through an `aria-live` region), "Show more" while `nextCursor` is set.
WAI-ARIA tree pattern: `role="tree"`, `treeitem` with `aria-expanded`, `aria-level`,
`aria-setsize`/`aria-posinset`, and one roving `tabindex`. Slugs are shown as text (React
escaping); no HTML from data is rendered.

## Testing

`pnpm test` exists, so every logic step ships passing tests.

- `@cms/db`: integration tests against real Postgres, including the 5,000-node paging and
  the plan check.
- `apps/api`: `app.inject` tests with the fake auth adapter, including forbidden and
  cross-site cases (rule 5).
- `apps/admin`: Vitest unit tests for the pure tree-state and keyboard module only. The
  Clerk screens and the live shell are not exercised automatically (no keys, no browser
  harness); record that as remaining risk.
- Final gate: `pnpm verify`. Last run on this code (main at aa58280, the same code as the
  reviewed 90406fd): pass (typecheck, lint, 154 tests, build).

## Notes for the AI

- Server components and server actions call the API through `lib/api.ts`; the admin
  never connects to the database, and the Clerk token never reaches client JavaScript.
- The site switcher and tree show only what the API returns for the signed-in person.
- Follow existing patterns: `withSite` plus explicit `site_id` filters, strict Zod input,
  `requireUser` for the actor.
- Keep components small; add only the shadcn/ui components the shell uses.

## Open questions

None blocking. The site-scoped URL shape above is a proposal; say so at review if you
prefer the plan's site-less routes with the site kept in a cookie.
