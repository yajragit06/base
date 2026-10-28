# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-10 [P3] open - Host ports with leading zeros bypass install-wide host uniqueness

**File:** packages/db/src/sites.ts:7
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security, quality)
**Why it matters:** `HOST` captures `:(\d{1,5})` and only range-checks the numeric value, so `acme.com:08080` and `acme.com:080` are accepted and stored verbatim (confirmed by a probe of the regex and range check). `domains_host_key` compares text, so one site can hold `acme.com:8080` while another holds `acme.com:08080`, which defeats the spec's "unique across the install" rule for the same host and port. If Feature 23 parses the port numerically, host resolution becomes ambiguous; if it matches strings, the zero-padded entry is unreachable data. Feature 3 will expose `addDomain` to user input.
**Suggested fix:** Reject leading zeros in the port (`(?::([1-9]\d{0,4}))?`) or store the canonical `String(port)`, and add `acme.com:08080` to the malformed-host test.
**Resolution:**

### F-11 [P3] open - Command tests do not fully assert the "exactly one audit row" done-when

**File:** packages/core/src/commands/commands.test.ts:418
**Found:** 2026-10-27 by /audit independent (scope: current; lens: tests)
**Why it matters:** Step 4's done-when requires tests to prove that each command writes exactly one audit row with the right actor type and id, action, target and diff. Only the `site.create` test asserts all of that, including that no other row exists. The `site.addDomain` success test destructures `[audit]` and checks only action and target: it does not check the actor type or id, the diff, or the row count. The `entry.create` success test checks actor, action, target and diff but not the row count. Today `runCommand` inserts exactly one row, so this is not a live defect. It is a weaker proof than the spec claims, and a regression such as a handler also auditing would go unnoticed.
**Suggested fix:** In the `site.addDomain` and `entry.create` success tests, destructure `[audit, ...rest]` and assert `rest` is empty, as the `site.create` test does. Add `actorType`, `actorId` and a `diff.after` match (domain id and host) to the `site.addDomain` assertion. Test-only change; no current requirement is lost.
**Resolution:**

### F-13 [P3] open - Role check runs in a separate transaction from the command

**File:** packages/core/src/permissions.ts:24
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security)
**Why it matters:** `roleAuthorizer` reads the actor's membership through `getMembership`, which runs in its own `withSite` transaction. It is called from `runCommand` (packages/core/src/command.ts:69) before the command's transaction starts. If an Owner demotes an Admin to Viewer while that Admin's `membership.grant` (non-owner role) or `entry.create` is in flight, the Admin's write can still commit after the demotion. `membership.grant` re-reads the actor's role inside the locked transaction only for changes that involve Owner. The window is small and needs a concurrent demotion, so this is a consistency gap rather than a live escalation.
**Suggested fix:** Run the authorizer inside the command's transaction: pass `tx` to the `Authorizer` and read the membership with `getMembershipInTx`. As a smaller alternative, have `membership.grant` re-check that the actor still holds an Owner or Admin role after taking the site row lock. Add a test for a demotion that happens during the command. No current requirement is lost.
**Resolution:** 2026-10-27 independent review of 4468c19..5764d3d: `entry.saveDraft` has the same gap. It re-reads the membership inside its transaction (packages/core/src/commands/versions.ts:45) but only enforces the Author rule. An Editor demoted to Viewer, or removed, after the authorizer ran still saves (`membership?.role === "author"` fails open on `viewer` or `null`). Cheap fix: in that in-transaction read, also require `membership !== null && PERMISSIONS['entry.saveDraft'].includes(membership.role)` for user actors. Repaired for `entry.saveDraft` (Feature 5 step 4): the save re-reads the membership under the entry lock and refuses with `forbidden` unless the role still holds `entry.saveDraft`; a test demotes an Editor to Viewer and removes another member after the authorizer ran. The general fix (authorizer inside the command transaction) is still open for the other commands. 2026-10-27 independent review of 4468c19..90406fd: the `entry.saveDraft` repair is confirmed (versions.ts:43-53 fails closed on null or a role without the permission, and the racing-authorizer test proves it). A narrower window remains: the re-read is an unlocked READ COMMITTED select and `membership.grant` takes no lock the save holds, so a demotion that commits after that read but before the save commits is not seen. Reading the membership `FOR SHARE` would close it for this command. The finding stays open for the general fix.

### F-14 [P3] open - A sign-in with no primary email answers 500 with the internal message

**File:** apps/api/src/auth.ts:299
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** `getProfile` throws a plain `Error` when the Clerk user has no primary email (possible on a Clerk instance that allows phone or username sign-in), and `requireUser` (auth.ts:337) rethrows anything other than `UnverifiedEmailError`. A probe with a fake adapter confirmed `GET /me` then returns 500 `{"statusCode":500,"error":"Internal Server Error","message":"Clerk user <id> has no primary email address."}` on every request. The `/me` contract lists only 200, 401 and 403, so the admin app gets an unstable error that looks like a server fault, and the internal message reaches the client. The request is still refused, so this is not an authorization gap.
**Suggested fix:** Have `getProfile` throw a typed error for a missing email (or reuse `UnverifiedEmailError` with a reason) and map it in `requireUser` to a stable 403 such as `{ error: "email_required" }`. Add the case to `auth.test.ts` and an `app.inject` test that asserts no user row. No current requirement is lost.
**Resolution:**

### F-15 [P3] open - AGENTS.md test command omits that `@cms/api` tests now need TEST_DATABASE_URL

**File:** AGENTS.md:387
**Found:** 2026-10-27 by /audit independent (scope: current; lens: quality)
**Why it matters:** The spec's Testing section says `apps/api` tests "now need `TEST_DATABASE_URL` like the other packages", and `apps/api/vitest.config.ts` throws without it. The Commands section still says only "`@cms/db` and `@cms/core` tests need `TEST_DATABASE_URL`", so the documented setup is incomplete for anyone running the API tests alone.
**Suggested fix:** Change the line to "`@cms/db`, `@cms/core` and `@cms/api` tests need `TEST_DATABASE_URL` exported". Documentation only; no current requirement is lost.
**Resolution:**

### F-18 [P3] open - No test proves a saved draft stores the validated data rather than the raw input

**File:** packages/core/src/commands/versions.test.ts:113
**Found:** 2026-10-27 by /audit independent (scope: current; lens: tests)
**Why it matters:** The spec says the version stores data "exactly as validated", and its notes say "Use `structuredClone`d validated data from `validateEntry`, never the raw input". The first save test passes `{ title: " Hello " }` but never asserts `v1.data`. `v2.data` is checked only with input that validation leaves unchanged. The test content type has no defaulted or transformed field, so a regression that wrote `input.data` instead of `validated.data` (packages/core/src/commands/versions.ts:104) would pass every test. This is not a live defect: the handler uses `validated.data` today.
**Suggested fix:** Give the test content type a field with a default (or another value that validation changes), save without that field, and assert the stored `data` holds the validated output. Test-only change; no current requirement is lost.
**Resolution:**

### F-24 [P3] open - Top-level tree pages cannot use index order and read every remaining top-level row

**File:** packages/db/src/entries.ts:233
**Found:** 2026-10-27 by /audit independent (scope: current; lens: performance, tests)
**Why it matters:**
- `entries_site_parent_idx` is `(site_id, parent_id, sort_order)`, without `id`. For the top level the filter is `parent_id IS NULL`, which PostgreSQL does not treat as an equality that fixes the index prefix. So `ORDER BY sort_order, id LIMIT n` is never produced by the index there: every top-level page reads all remaining top-level rows and top-N sorts them.
- EXPLAIN ANALYZE as `cms_app`, in rolled-back transactions:
  - A site whose 5,000 pages are all top level (the step 1 test shape) uses a Seq Scan on entries for both the first page and a cursor page (about 2 ms).
  - A flat site with 50,000 top-level pages uses a parallel Seq Scan for the first page (19 ms), and a cursor at 40,000 reads 10,001 rows (3.7 ms).
  - Adding `id` to the existing index does not change this.
  - Under a parent, ties on `sort_order` force the sort to cover every tied sibling (5,000 siblings with sort order 0: 2.3 ms per page).
- Speed meets the 5,000-node target today, so this is not a live defect.
- The plan test passes only because its top level is 8% of the site, and the code comment ("keeps keyset paging on the ... index") overstates the guarantee.

**Suggested fix:**
- In a forward migration, add a partial index `(site_id, sort_order, id) WHERE parent_id IS NULL`. A probe gave Index Only Scan at 0.07 ms on both the first and cursor pages of the flat 5,000-page site.
- Optionally add `id` to `entries_site_parent_idx`, so that ties under a parent are index-ordered.
- Add a flat 5,000-top-level shape to the plan test.
- Alternatively, accept this at the current scale and correct the code comment. No current requirement is lost.

**Resolution:**

### F-25 [P2] open - A rejected tree load leaves the list "Loading…" forever with no Retry

**File:** apps/admin/components/tree/page-tree.tsx:56
**Found:** 2026-10-28 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:**
- `load` awaits `loadChildren` without a `try`/`catch`, and the effect calls it as `void load(...)` (page-tree.tsx:71).
- `loadChildren` (app/sites/[siteId]/actions.ts:22) rethrows every error that is not an `ApiError`. That includes a `fetch` failure when the API is unreachable, and a token or JSON failure.
- When the browser cannot reach the server action, the call also rejects. The installed Next docs (01-app/02-guides/offline-support.md:314) say "a Server Action called with no network throws a fetch error and the awaited promise rejects".
- In each case `loadError` is never dispatched, and the list keeps `status: "loading"` for good. An expanded node shows a spinner that never ends, and a "Show more" or "Retry" row stays "Loading…" with no way to retry short of a page reload.
- Because step 7 makes `onKey` ignore keys while focus rests on a loading row, arrow keys, Enter and Space then do nothing there. Tab and the mouse still work.
- The spec's tree states promise an error state with Retry for each node. The unreachable-API case is exactly the outage F-22 handles for server renders.
- No test covers a rejected load, because the component has no tests.

**Suggested fix:** Wrap the `await loadChildren(...)` in `load` in `try`/`catch` and dispatch `loadError` (and the announcement) on any rejection. Optionally, have `loadChildren` return `{ ok: false }` for non-`ApiError` failures as well. No current requirement is lost.
**Resolution:**

### F-26 [P3] open - A repeated tree load failure is not announced again

**File:** apps/admin/components/tree/page-tree.tsx:64
**Found:** 2026-10-28 by /audit independent (scope: current; lens: quality)
**Why it matters:** Every failed load sets the same `announcement` string. After the first failure the state does not change, so React leaves the `aria-live` text untouched, and screen readers announce nothing when a Retry fails again. Focus stays on the same Retry row, so nothing else signals the second failure either. The spec says the error state is "announced through an aria-live region".
**Suggested fix:** Clear the announcement when a load starts, or vary the text (for example include the attempt count), so each failure changes the live region. No current requirement is lost.
**Resolution:**
