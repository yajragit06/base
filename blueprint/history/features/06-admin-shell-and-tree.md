# Feature: Admin shell and tree

**From build-plan:** feature 6
**Build attempt:** 1
**Branch:** feature/admin-shell-and-tree
**Status:** verified

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

- [x] 1. **Paged children in `@cms/db`.** `listChildrenPage(db, siteId, parentId,
  { after?, limit? })` returns `{ items, nextCursor }` in tree order, each item with
  `hasChildren`, using keyset paging on `(sort_order, id)` and the existing
  `entries_site_parent_idx`.
  **Done when:** integration tests page through 5,000 children of one parent (and 5,000
  top-level entries) and get every entry exactly once in order; `hasChildren` is right for
  leaf and parent nodes; an unknown parent or another site's parent returns
  `parent_not_found`; another site's entries never appear; and an `EXPLAIN` test on a
  5,000-entry site shows no sequential scan of `entries`.
- [x] 2. **`GET /sites/:siteId/tree`.** A `requireSiteMember` pre-handler (after
  `requireUser`) loads the caller's membership on the site; the handler calls
  `listChildrenPage`.
  **Done when:** `app.inject` tests prove 401 without a token; 403 for a non-member and
  for a member of another site (cross-site); 200 for a Viewer; 404 for an unknown or
  malformed site id and for a parent outside the site; 400 for a bad cursor or limit;
  and paging returns `nextCursor` until the last page.
- [x] 3. **Admin foundation.** Add Tailwind CSS 4 and shadcn/ui (`components.json`,
  `lib/utils.ts`, only the components used); `@clerk/nextjs` with `ClerkProvider`, a
  `proxy.ts` that protects every route except `/sign-in`, and `/sign-in/[[...sign-in]]`;
  `lib/api.ts`, a server-only client that calls `API_URL` with `Authorization: Bearer`
  from Clerk's `auth().getToken()`; `/` redirects to the first site from `GET /me`, or
  shows the no-sites empty state. Check the installed Clerk and Next 16 APIs (`proxy.ts`,
  `clerkMiddleware`) before writing them, and pin versions.
  **Done when:** `pnpm --filter @cms/admin typecheck` and `build` pass without Clerk keys
  (pages render dynamically, so nothing needs keys at build time), `.env.example` lists
  the new variables, and the page title is "Base".
- [x] 4. **Shell, site switcher and tree.** `/sites/[siteId]` layout: a header with the
  product mark, the site switcher (sites from `/me`) and Clerk's user button; a tree pane
  and a main pane. The tree is a client component fed by server actions that call the
  tree route: lazy children on expand, "Show more" for `nextCursor`, and the states below.
  **Done when:** admin Vitest tests cover the tree state (expand, collapse, append a page,
  loading and error per node) and keyboard moves (Up, Down, Right to expand or enter,
  Left to collapse or go to the parent, Home, End, Enter to select); `typecheck` and
  `build` pass; and a 403 or 404 from the API shows the not-found page, not a crash.
- [x] 5. **Docs and final gate.** Document the route, the admin env vars and the
  site-scoped URL rule in `AGENTS.md`.
  **Done when:** `pnpm verify` passes and there is no migration drift.
- [x] 6. **Repair review findings F-19, F-20, F-21 and F-22.** Reject cursors whose sort
  value is outside the int4 range with `invalid_cursor`; compute `hasChildren` with a
  second indexed query over the page's ids and compare `(sort_order, id)` as a row value;
  render the tree flat from its visible rows (ARIA `aria-level`, no groups) with "Show
  more" and "Retry" as tree items in the roving focus, loading rows hidden from assistive
  tech, and a chevron that cannot take focus; show an explained state when `/me` answers
  `email_not_verified`, and an `app/error.tsx` with retry for API outages.
  **Done when:** db and API tests give 400 `invalid_cursor` for out-of-range cursors;
  plan tests show no sequential scan for a cursor page under a 5,000-child parent and on
  the top level; tree-state tests cover keyboard activation of "Show more" and "Retry"
  and focus moving to the first new item; F-19 to F-22 are marked `fixed`; and
  `pnpm verify` passes.
- [x] 7. **Repair review findings F-23 and F-22.** Keys pressed while focus rests on a
  loading row do nothing; DOM focus follows the focused row after a load even when the
  focused status row was removed; "Try again" on the error page calls Next 16's `retry()`.
  Loading rows stay busy, disabled tree items rather than hidden ones, because keyboard
  focus can rest on them while "Show more" or "Retry" loads (this replaces step 6's
  "hidden from assistive tech").
  **Done when:** tree-state tests prove ArrowDown, Enter and Space on a focused loading
  row leave the state unchanged and that the last page moves focus to its first new page;
  F-23 and F-21 are marked `fixed` and F-22 `fixed`; and `pnpm verify` passes.

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


<!-- blueprint:completion {"schemaVersion":2,"specBytes":10922,"specSha256":"2c00ebfa7e34ca227b7880dc7e47fe712ac39a9d2bf5ed5d1b888599cf04dfbf","branch":"refs/heads/feature/admin-shell-and-tree","head":"ae74322396877bf67cdc6aa2bc0b2eb6e008f6a2","baseRef":"refs/heads/main","baseCommit":"aa582804fb2adccad7bb79c3985e52a89e646b81","sourceTree":"dc0796204e1e0dc7bb1c7ad3e6ea879f11a6f34f","landing":"pull-request","absentOptional":[]} -->

## Findings

### 06/F-19 [P2] closed - Out-of-range cursor sort value answers 500 with the SQL text

**File:** packages/db/src/entries.ts:195
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security, quality)
**Why it matters:** `decodeCursor` accepts any `Number.isSafeInteger` for `s`, but `sort_order` is an int4 column. A cursor such as base64url `{"s":2147483648,"i":"<uuid>"}` (also tested with -2147483649 and 2^53-1) passes validation, and Postgres then rejects the parameter. The route rethrows the non-`DbError` (apps/api/src/routes/tree.ts:31), and a probe with `app.inject` returned 500 with Fastify's default body: the full "Failed query: select ..." SQL and its parameters. The spec says anything other than a valid cursor fails with 400 `invalid_cursor`. Any member of a site can trigger this with a crafted `after`, so the contract breaks and internal query text is exposed. No data from another site leaks.
**Suggested fix:** In `decodeCursor`, require `s` to be an integer within -2147483648..2147483647 (the int4 range) and otherwise throw `invalid_cursor`. Add the out-of-range cursor to the db `invalid_cursor` loop and an API case that asserts 400 `{ error: "invalid_cursor" }`. Also assert the status code, not only the body, for the existing `after=zz` API case. No current requirement is lost.
**Resolution:** Fixed: `decodeCursor` (packages/db/src/entries.ts) accepts only an integer sort value within the int4 range and otherwise throws `invalid_cursor`. The db test adds 2147483648, -2147483649, `Number.MAX_SAFE_INTEGER` and 1.5 to the invalid-cursor loop; the API test asserts 400 `{ error: "invalid_cursor" }` with the status code for `zz` and an out-of-range cursor. Closed 2026-10-27 by independent review of aa58280..0d3e997: the range and integer checks are in place, the uuid check still guards `i`, the route maps the error to 400, and the db and API tests pass uncached. No other path in the route reaches a non-`DbError` from user input.

### 06/F-20 [P2] closed - Cursor pages compute hasChildren with a sequential scan of the site's entries

**File:** packages/db/src/entries.ts:224
**Found:** 2026-10-27 by /audit independent (scope: current; lens: performance, tests)
**Why it matters:** For a cursor page under a parent with 5,000 children (5,501 entries on the site), `EXPLAIN (ANALYZE, BUFFERS)` of `childrenPageQuery` inside `withSite` shows the `hasChildren` EXISTS planned as a hashed SubPlan over `Seq Scan on entries child`, which reads every entry of the site on each "Show more". The first page (no cursor) uses the correlated index-only probe, and that is the only plan the spec's test checks (packages/db/src/tree.test.ts:150, `cursor` undefined, 100 children per parent). The step 1 done-when ("an EXPLAIN test on a 5,000-entry site shows no sequential scan of entries") therefore holds only for first pages. The cost is small at 5,000 nodes (1.9 ms) but grows linearly with site size on every paged request.
**Suggested fix:** Compute `hasChildren` in a second indexed query limited to the page's ids, for example `SELECT DISTINCT parent_id FROM entries WHERE site_id = $1 AND parent_id = ANY($ids)` inside the same `withSite`, then map the result onto the items. Extend the plan test to a cursor page under a parent with 5,000 children (and the top level) and assert there is no `Seq Scan`. No current requirement is lost.
**Resolution:** Fixed: `childrenPageQuery` no longer computes `hasChildren` and compares `(sort_order, id)` as a row value; `parentsAmongQuery` then probes the parent index once per id on the page (`unnest` + `LATERAL ... LIMIT 1`), so the cost follows the page size. The plan test (tree.test.ts, "pages a 6,500-node site through indexes only") builds a site with a 5,000-child parent, 500 top-level pages and 100 small branches, and asserts no sequential scan for cursor pages under the big parent and on the top level, and for both `hasChildren` lookups. Closed 2026-10-27 by independent review of aa58280..0d3e997. EXPLAIN ANALYZE as `cms_app` with 20 extra sites showed 100 Index Only Scan probes for `parentsAmongQuery` (0.7 ms), and Index Scan with Incremental Sort for a cursor page under the 5,000-child parent (0.3 ms). The query is fully parameterised, filtered by site_id, runs under RLS and is skipped on an empty page. The top-level ordering cost on flat sites is pre-existing and unrelated to this repair; it is tracked as F-24.

### 06/F-21 [P2] closed - Tree status buttons and text sit inside role="tree"/"group" as extra tab stops

**File:** apps/admin/components/tree/page-tree.tsx:128
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** `Branch` renders `ListStatus` (the "Loading…" text, "Couldn't load. Retry" and "Show more" buttons, page-tree.tsx:211-256) as a direct child of `role="tree"` or of a nested `role="group"`. In the WAI-ARIA tree pattern, those containers may own only `treeitem` and `group`, so screen readers in tree mode may not expose the controls, and automated checks such as axe `aria-required-children` will flag them. Each "Show more" or "Retry" is also a normal tab stop inside the tree, which breaks the spec's "one roving tabindex" and its WCAG 2.1 AA goal. A related point: mouse-clicking the chevron puts DOM focus on that `aria-hidden` button, and `onKeyDown` then ignores arrow keys because the event target is not a `treeitem`, so keyboard navigation stops until an item is clicked.
**Suggested fix:** Render "Show more" and "Retry" as `role="treeitem"` rows that take part in the roving focus and activate on Enter or Space (the APG permits this), or move them outside the `tree` and `group` elements. Mark the loading row as presentational or place it outside the tree. Make the chevron not focusable on mouse down (for example `onMouseDown={e => e.preventDefault()}`) or move focus to the item when it is clicked. Add a state test for keyboard activation of "Show more". No current requirement is lost.
**Resolution:** Fixed: the tree renders flat from `visibleRows` (ARIA `aria-level`, no groups). "Loading…", "Retry" and "Show more" are status rows with `role="treeitem"` in the same roving focus; loading rows are skipped by the arrow keys and cannot be focused; Enter or Space activates "Show more" and "Retry"; after a load, focus moves to the first new page. The chevron is a non-focusable span, so a click leaves focus on the row and the arrow keys keep working. tree-state.test.ts covers keyboard activation of "Show more" and "Retry", focus moving to the first new page, loading rows being skipped, and collapsing from a status row. 2026-10-27 independent review of aa58280..0d3e997: the original defects are gone (the tree owns only tree items, there is one roving tabindex, and the chevron cannot take focus). It is not closed because the repair introduced F-23: keys pressed on a focused loading row act on the first rows of the tree, DOM focus is lost when the last page loads, and loading rows are still exposed to assistive tech despite step 6. Close this together with F-23. Step 7 repaired F-23, the defect this repair introduced. Closed 2026-10-28 by independent review of aa58280..ae74322: page-tree.tsx renders only `treeitem` rows under `role="tree"` with one roving tabindex, and the chevron is an `aria-hidden` span. F-23 is closed in the same pass. The step 7 key guard is correct for loads that settle; a load that never settles is the separate, older defect F-25.

### 06/F-22 [P3] closed - Admin shell crashes on a /me error or an unreachable API

**File:** apps/admin/app/sites/[siteId]/layout.tsx:18
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality)
**Why it matters:** The layout (and `app/page.tsx:5`) calls `apiGet<Me>("/me")` without handling `ApiError`, and the admin has no `error.tsx`. A signed-in person whose email the provider has not verified gets 403 `email_not_verified` from `/me`, and an unreachable API throws from `fetch`. Either case shows Next's generic error page instead of a calm, explained state. The spec's done-when ("a 403 or 404 from the API shows the not-found page, not a crash") is met for the tree call but not for the shell's own `/me` call.
**Suggested fix:** Map an `ApiError` from `/me` to a small explained state (for example "Verify your email to continue" for `email_not_verified`) and add an `app/error.tsx` with a retry for API outages. No current requirement is lost.
**Resolution:** Fixed: `getMe()` (apps/admin/lib/api.ts) returns `"email_not_verified"` for that API error, and `/` and the site layout then show `VerifyEmail` ("Verify your email to continue", with sign out). Other failures, such as an unreachable API, reach the new `app/error.tsx`, which explains the problem and offers "Try again". Checked by typecheck and build only; no live render (no Clerk keys). Reopened 2026-10-27 by independent review of aa58280..0d3e997. The verify-email state is correct. But `app/error.tsx:14` wires "Try again" to `reset()`, and the installed Next 16.4.3 documentation (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md) says `reset()` re-renders "without re-fetching the contents" and recommends `retry()` (stable since v16.3.0). The failure comes from the server render (`/me` or the tree fetch), so pressing "Try again" after the API recovers re-renders the same failed result, and only a full reload recovers. Fix: take `retry` from the props and call it from the button. Fixed again (Feature 6 step 7): `app/error.tsx` takes `retry` from its props and the "Try again" button calls `retry()`, which re-fetches and re-renders the segment in Next 16.4.3. Checked by typecheck and build only. Closed 2026-10-28 by independent review of aa58280..ae74322: error.tsx:14 calls `retry()`, which the installed Next 16.4.3 error.md documents as "re-fetch and re-render". The root `error.js` wraps `sites/[siteId]/layout.tsx` and `app/page.tsx`, the two server renders that call `/me`, and `email_not_verified` maps to `VerifyEmail` in both. Client-side tree loads are outside this finding's scope; see F-25.

### 06/F-23 [P2] closed - Tree keys act on the wrong rows while a list loads, and focus is lost when the last page arrives

**File:** apps/admin/components/tree/tree-state.ts:221
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:**
- Activating "Show more" or "Retry" leaves `focusedId` on that list's status row, which becomes a "loading" row. `onKey` drops loading rows and then falls back to index 0 (`Math.max(0, findIndex(...))`). So a key pressed during the load acts as if the first row were focused.
- A node probe of `tree-state.ts` confirmed this: after End then Enter on a top-level "Show more", ArrowDown moves focus to the second page and Enter selects the first page.
- When the load completes with `nextCursor: null`, the status row (the element with DOM focus) unmounts and DOM focus falls to the body. The roving-focus effect (apps/admin/components/tree/page-tree.tsx:73) then returns early, because `document.activeElement` is outside the tree. So the "focus moves to the first new page" that step 6 promises happens only in state, not in the DOM, for the final page and for a Retry that loads a whole list. This was found by reading the code; no browser harness exists to confirm it.
- Step 6 also says loading rows are "hidden from assistive tech", but they render as `role="treeitem"` with `aria-busy` and `aria-disabled`.
- The effect is a keyboard-operability and focus-order problem against the spec's WCAG 2.1 AA goal.

**Suggested fix:**
- In `onKey`, when the focused row is a loading row, ignore the key, or resolve the index against all rows before filtering.
- In `page-tree.tsx`, track whether focus was inside the tree before the commit (for example a ref set in `onFocus` and `onBlur`) instead of reading `document.activeElement` after a row unmounts. Alternatively, keep the status row mounted until focus has moved.
- Either hide the loading row from assistive tech as specified, or amend the spec.
- Add state tests for ArrowDown and Enter on a focused loading row. No current requirement is lost.

**Resolution:** Fixed (Feature 6 step 7): `onKey` (apps/admin/components/tree/tree-state.ts) ignores every key while focus rests on a loading row; a state test presses ArrowDown, ArrowUp, Home, End, Enter, Space and Left on a focused loading row, asserts the state is unchanged, and checks that the last page moves focus to its first new page (the test fails without the guard). `page-tree.tsx` records whether focus was last inside the tree (`onFocus`, and `onBlur` only when focus moves to another element outside it), so when the focused status row is removed and focus drops to the body, DOM focus follows the focused row. Loading rows stay busy, disabled tree items because focus can rest on them; step 7 replaces step 6's "hidden from assistive tech". The DOM half is checked by typecheck and build only (no browser harness). Closed 2026-10-28 by independent review of aa58280..ae74322. The `onKey` guard at tree-state.ts:225 holds. A probe confirmed `loadSuccess` moves focus only when it was on that list's status row (not if the user moved away mid-load) and keeps focus on the parent after a mid-load collapse. The roving-focus effect at page-tree.tsx:75-83 never takes focus from a focused element outside the tree. The loading-row semantics match step 7's amendment. Not browser-verified (no harness).

## Independent review

**Status:** passed
**Target commit:** ae74322396877bf67cdc6aa2bc0b2eb6e008f6a2
**Base commit:** aa582804fb2adccad7bb79c3985e52a89e646b81
**Base ref:** refs/heads/main
**Spec hash:** 2c00ebfa7e34ca227b7880dc7e47fe712ac39a9d2bf5ed5d1b888599cf04dfbf
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-28T00:11:32Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-28T00:14:52Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `aa582804fb2adccad7bb79c3985e52a89e646b81..ae74322396877bf67cdc6aa2bc0b2eb6e008f6a2` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`, `git merge-base refs/heads/main HEAD`, `sha256sum blueprint/context/current-feature.md`, `git status --porcelain --untracked-files=all`: pass (HEAD is the target, the merge base matches, the spec hash matches, only review.md and findings.md differ)
- `pnpm verify` (TEST_DATABASE_URL set): pass, all Turbo tasks replayed from cache
- `pnpm turbo run typecheck build --force`: pass (10/10 tasks, 0 cached)
- `pnpm turbo run test --concurrency=1 --force`: pass (0 cached; admin 10, db 54, schema 39, core 56, api 16 tests)
- `pnpm lint`: pass (Biome, 109 files)
- `pnpm --filter @cms/db generate`: pass ("No schema changes, nothing to migrate"; no files written)
- `node --experimental-strip-types` probe of a /tmp copy of tree-state.ts (since deleted): pass (edge cases behave as noted under Evidence)

### Evidence

- Whole delta reviewed across four commits (0ff5937, aeea4e6, 0d3e997, ae74322): db `listChildrenPage` and its cursor; API `requireSiteMember` and the `/sites/:siteId/tree` route; admin proxy, API client, server action, layouts, error and not-found pages, site switcher, tree state and component; config, AGENTS.md and .env.example.
- Security: the route runs `requireUser`, then `requireSiteMember` (404 for a malformed id, 403 for a non-member or an unknown well-formed id), then a strict Zod query. Reads run in `withSite` with an explicit `site_id` filter, and `parentsAmongQuery` is fully parameterised. The cursor checks int4 range and a uuid. The server action hands only siteId (`encodeURIComponent`) and URLSearchParams to the fixed `API_URL`. The token stays server-only. Slugs render as React text.
- Paging: the row-value keyset `(sort_order, id) > (s, i)` with limit+1 is correct. Tests page 5,000 children and 5,000 top-level entries exactly once and in order. The plan test asserts no Seq Scan on cursor pages and on the `hasChildren` lookups.
- tree-state.ts: `onKey` ignores every key on a focused loading row. `loadSuccess` moves focus to the first new page only when focus was on that list's status row; if the user moved focus away mid-load, it stays where they put it (probe). A collapse during a load keeps focus on the parent (probe). Retry after a failed "Show more" reuses the previous cursor (probe).
- page-tree.tsx: the `focusWithin` ref is cleared only when `relatedTarget` is a Node outside the tree. The roving-focus effect therefore moves DOM focus only if focus is in the tree, or if it dropped to the body after leaving the tree last. It never takes focus from a focused element outside the tree.
- ARIA: the tree is flat and owns only `treeitem` rows, with `aria-level`, `aria-posinset` and `aria-setsize` (-1 while more can load), one roving tabindex, and a chevron that cannot take focus. Loading rows are busy, disabled tree items, as step 7 amends.
- error.tsx calls `retry()`, which the installed Next 16.4.3 docs (01-app/03-api-reference/03-file-conventions/error.md) recommend over `reset()`. A root `error.js` wraps the nested site layout and the home page.
- Tests cover each Done-when for steps 1, 2, 4, 6 and 7 at the state and API level. No tests are skipped, focused or placeholders.

### Findings

- F-21 closed, F-22 closed, F-23 closed (repairs confirmed against the target)
- F-19, F-20 remain closed (no regression)
- F-25 [P2] open: a rejected tree load (API unreachable, or a server-action network failure) leaves the list "Loading…" for good with no Retry
- F-26 [P3] open: a repeated load failure is not re-announced in the live region
- F-24 [P3] remains open by the user's choice; older P3s (F-10, F-11, F-13, F-14, F-15, F-18) unchanged

### Remaining risk

- No browser harness and no Clerk keys: DOM focus moves, screen-reader output, sign-in, the site switcher, the verify-email state and the error page are checked only by reading the code, typecheck and build.
- Unverified: in browsers that do not focus a button on click (Safari on macOS), a user who starts "Show more" and then clicks outside the tree leaves focus on the body. When the load finishes, focus is pulled back into the tree.
- Unverified performance: every tree state change re-renders all visible rows (no memo). With thousands of expanded rows this may make each keypress slow. Not profiled.
- `pnpm verify` replayed cached results; the uncached reruns above are the evidence.

## Try it now

Needs Postgres with migrations applied, a site whose owner is you, and keys from one Clerk instance in `.env` (`CLERK_SECRET_KEY` for the API and admin, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` for the admin).

1. `pnpm dev`, then open http://localhost:3000: you are sent to `/sign-in`; after signing in, `/` takes you to `/sites/<your site>`.
2. The header shows the Base mark, the site switcher (your sites with your role) and your Clerk user menu.
3. In the tree, Tab focuses the first page; Up, Down, Home and End move; Right opens a branch (children load lazily) and Left closes it; Enter selects. With more than 100 pages at one level, "Show more" appears at the end of the list.
4. Without a token, `curl -i localhost:4000/sites/<site id>/tree` answers 401; a member's request with `?after=zz` answers 400 `invalid_cursor`.
