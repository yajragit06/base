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

### F-12 [P2] fixed - Owner bootstrap trusts an unverified provider email

**File:** apps/api/src/auth.ts:45
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security)
**Why it matters:** `clerkAuthAdapter.getProfile` copies `primaryEmailAddress.emailAddress` into `users.email` without reading its `verification.status`. The installed `@clerk/backend` 3.26.3 types this as `verification: Verification | null`, so Clerk can return an unverified primary address, for example a user created through the Backend API with verification skipped, or an instance that does not require verification at sign-up. `createSiteWithOwner` (apps/api/src/bootstrap.ts:25) then grants the Owner role to whichever single user holds that email. Someone who signs in first with an unverified copy of the intended owner's address would become Owner of the new site. If the real owner has also signed in, the script refuses with "More than one user". Exploiting it depends on how the Clerk instance is configured, so this is not P1, but the email is the only identity link the bootstrap trusts.
**Suggested fix:** In `getProfile`, accept the primary email only when `verification?.status === "verified"`, and otherwise throw, as it already does for a missing email. Extend `ClerkCalls.getUser`'s return type and the stubbed test with a verified case and an unverified case. No current requirement is lost.
**Resolution:** Fixed: the Clerk adapter's `getProfile` accepts the primary email only when `verification.status` is `verified` and otherwise throws `UnverifiedEmailError`; `requireUser` answers 403 `email_not_verified` and creates no user (apps/api/src/auth.ts). Tests cover verified, unverified, expired and missing verification (auth.test.ts) and the 403 with no user row (app.test.ts).

### F-13 [P3] open - Role check runs in a separate transaction from the command

**File:** packages/core/src/permissions.ts:24
**Found:** 2026-10-27 by /audit independent (scope: current; lens: security)
**Why it matters:** `roleAuthorizer` reads the actor's membership through `getMembership`, which runs in its own `withSite` transaction. It is called from `runCommand` (packages/core/src/command.ts:69) before the command's transaction starts. If an Owner demotes an Admin to Viewer while that Admin's `membership.grant` (non-owner role) or `entry.create` is in flight, the Admin's write can still commit after the demotion. `membership.grant` re-reads the actor's role inside the locked transaction only for changes that involve Owner. The window is small and needs a concurrent demotion, so this is a consistency gap rather than a live escalation.
**Suggested fix:** Run the authorizer inside the command's transaction: pass `tx` to the `Authorizer` and read the membership with `getMembershipInTx`. As a smaller alternative, have `membership.grant` re-check that the actor still holds an Owner or Admin role after taking the site row lock. Add a test for a demotion that happens during the command. No current requirement is lost.
**Resolution:**
