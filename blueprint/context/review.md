# Independent Review

**Status:** passed
**Target commit:** 351cf63165e0cb0b51fd27cac11089e0a2904ada
**Base commit:** 93959a57c8aa1af14e352c5632a510d34cdb6b72
**Base ref:** refs/heads/main
**Spec hash:** b6f63487e9e48055c53f1c40e8710561a00184bd805d149a29f1884a1d34a93b
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-27T09:17:29Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-27T09:21:09Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `93959a57c8aa1af14e352c5632a510d34cdb6b72..351cf63165e0cb0b51fd27cac11089e0a2904ada` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

## Commands

- `pnpm verify` (TEST_DATABASE_URL=cms_test, DATABASE_URL=cms): pass (lint clean; tests db 38/38, schema 39/39, core 41/41, api 9/9; typecheck and build served from cache)
- `pnpm turbo typecheck build --force`: pass (10/10 tasks, 0 cached)
- `drizzle-kit generate` into a scratch copy of `packages/db/drizzle`: pass ("No schema changes"; directory identical)
- Rolled-back psql probe of `memberships` RLS as `cms_app` with `app.site_id` / `app.user_id`: pass

## Evidence

- Preflight: HEAD equals Target commit; `git merge-base refs/heads/main HEAD` equals Base commit; the `current-feature.md` SHA-256 matches Spec hash; the only changed path is `blueprint/context/review.md`.
- Auth: the actor comes only from `AuthAdapter.verify` on an `Authorization: Bearer` token (apps/api/src/auth.ts:63-73). A missing, malformed or rejected token returns 401 before any database write. The Clerk adapter uses the root `verifyToken` export, which returns the payload and throws on failure; it catches errors and requires a non-empty `sub`.
- Role matrix: `PERMISSIONS` matches the spec table. System actors are allowed, agents are denied, users are denied for unknown permissions and permissions with no site, and the permissions test covers every role against every permission plus the non-member, cross-site, agent, system and unknown-permission cases.
- `membership.grant`: a `FOR NO KEY UPDATE` lock on the site row serializes role changes per site. The Owner rule re-reads the actor's role inside that transaction. The last-owner count runs under the lock. The test where two owners demote each other at once confirms exactly one owner is left.
- RLS: in user scope, `memberships_own_rows` is SELECT-only. The probe showed INSERT rejected (42501), UPDATE and DELETE changing 0 rows, and only the caller's own rows visible. In site scope, a write to another site's membership fails (tested). `set_config(..., true)` is transaction-local, so pooled connections do not leak scope.
- Provisioning: `findOrCreateUser` upserts on `users_auth_id_key`. Ten concurrent calls create one row (tested), and `/me` fetches the profile once (tested).
- Tests for new routes: `/me` has 401 tests (no header, no scheme, Basic, empty, rejected) and a cross-site test with two users and two sites. `/healthz` stays public.
- Bootstrap: two system-actor commands and two audit rows (tested). It fails before creating anything when the email matches no user or several (tested).
- Migrations: new tables only (forward-only, compatible with the previous release); no schema drift.

## Findings

- F-12 [P2] open: the Clerk adapter's `getProfile` uses the primary email without checking that it is verified, and `create-site` grants Owner by matching that email.
- F-13 [P3] open: `roleAuthorizer` reads the role in its own transaction before the command's transaction starts, so a grant from someone who is being demoted at the same moment can still commit.
- F-10 [P3] open and F-11 [P3] open: from earlier features, unchanged by this delta.

## Remaining risk

- The Clerk adapter is tested only with a stubbed client. It has not been run against a real Clerk instance (no keys available). `authorizedParties` is not configured, which is acceptable for bearer-header tokens.
- A Clerk user with no primary email, or a Clerk API outage, during a first request returns 500 rather than 401.
- `create-site` runs `site.create` and `membership.grant` as two transactions. A database failure between them would leave a site with no owner, and someone would have to rerun the grant by hand.
- Check was not run (not required). No unavailable verification commands.
