# Project Plan

> Source: "Modern MODX-style CMS Framework - PRD (Open-core edition)", Oct 26, 2026,
> @Arjay. This plan keeps the PRD's decisions and adds the detail later `/feature`
> specs will need. Lines marked **Assumption** were inferred while converting the PRD
> and need confirming; lines marked **TODO** are open decisions. Architecture, stack
> and costs also live in a separate architecture doc (not part of this blueprint);
> where it disagrees with this plan, update this plan and re-run `/overview`.
>
> The product is named **Base** (tagline: "The tree-first CMS for developers, editors and
> AI agents."): npm scope `@base/*`, CLI `base`, scaffolder `create-base-app`. The code
> packages built so far still use the placeholder scope `@cms/*`.

## 1. Problem - What problem are we solving?

A TypeScript, API-first CMS framework that gives developers MODX's freedom and resource
tree, gives editors a clean schema-driven admin, and lets apps and AI agents use the same
content safely.

**What is broken today**

- **MODX 3 is flexible but dated.** It is tied to PHP, server-rendered pages and code
  stored in the database (snippets, chunks, plugins). Modern React frontends, mobile
  apps and Git-based workflows are awkward or impossible.
- **Headless CMSs lose the tree.** Strapi, Payload and Sanity are modern, but they are
  collection-first. Agency sites rely on MODX's tree-first model (a site is a tree of
  resources whose position defines the URL) and on the freedom to own all markup.
- **AI agents are not first-class users.** No CMS offers a safe, permissioned way for an
  agent to search, draft, edit and *request* publishing, with every action attributed
  and reversible.

**Why now**

- Developers adopt free, MIT-licensed TypeScript tools quickly, and no current CMS
  combines a tree-first model with built-in, permissioned AI agents (MCP).
- The free core spreads through developers; revenue comes from the businesses behind
  production sites, which pay for AI, team governance and managed hosting.
- AI features carry real per-use cost, so usage-based pricing for them feels fair.

**What v1 must prove:** at least one real client site runs on the framework in
production, and an AI agent drafts content that an editor approves and publishes.

**Product principles** (use these to settle feature-level disputes)

1. **Tree first.** Every page-like entry lives in a per-site tree; position defines URI.
2. **Schema in code, content in the database.** Content types, fields, blocks, hooks and
   extensions are TypeScript in Git. No code is ever stored in or executed from the
   database (the MODX lesson).
3. **One write path.** Admin UI, Admin API, CLI and MCP agents all go through the same
   typed commands with the same permission checks and the same audit log.
4. **AI drafts, humans publish.** By default no AI or agent action changes live content.
5. **Never paywall what a solo developer needs to build and launch a site.**
6. **Developers own the markup.** The framework renders nothing the developer did not write.

## 2. Users - Who is this for?

Every feature must serve at least one of the two primary personas.

| Persona | Who | Needs | Surface |
| --- | --- | --- | --- |
| **Developer** (primary) | Freelance, agency or in-house full-stack dev | Define content types in code, own all markup, extend with npm packages, deploy with Git, for free | Code, CLI, SDK |
| **Content editor** (primary) | Staff updating pages, news, media | Find pages in a tree, edit fields, preview, publish, roll back, without a developer | Admin app |
| **Paying customer** | Business or client that owns a production site | AI that saves staff time, team controls, reliable hosting, a simple invoice | Billing, admin app |
| **Site admin** | Project lead or company IT | Users, roles, domains, settings per site | Admin app |
| **AI agent** | Claude or another MCP client acting for a user | Search, draft and update within granted scope, request publishing | MCP server |
| **App developer** | Builds a mobile app on the same content | Typed, cached read API, push on publish | Delivery API, SDK, webhooks |

A **platform owner** (tenant signup, quotas, billing) appears only in v1.1 (SaaS).

**Roles (RBAC, per site):** Owner, Admin, Editor, Author, Viewer.

| Capability | Owner | Admin | Editor | Author | Viewer |
| --- | --- | --- | --- | --- | --- |
| Read content and drafts | yes | yes | yes | yes | yes |
| Create / edit drafts | yes | yes | yes | yes (own or granted subtree) | no |
| Publish, unpublish, schedule | yes | yes | yes | no (request only) | no |
| Move / delete entries, restore from trash | yes | yes | yes | no | no |
| Media upload | yes | yes | yes | yes | no |
| Users, roles, subtree policies | yes | yes | no | no | no |
| Sites, domains, locales, settings, tokens, webhooks | yes | yes | no | no | no |
| AI provider keys and budget, agent publishing switch, billing, delete site | yes | no | no | no | no |

**Assumption:** the matrix above is inferred from D1/D2 and G-1; confirm before Feature 4.
Subtree policies (D2) further *narrow or grant* these per tree node and apply to all
descendants. Denied actions are hidden in the UI **and** rejected by the API.

**Agents** act through scoped tokens (site, subtree, command list). An agent is never
more powerful than the human who created its token.

## 3. Features - What does the MVP need?

v1 (must ship; P0 unless marked P1). Story IDs from the PRD are kept in brackets so tests
and tickets can reference them.

**Content modeling (developer)**
- `defineContentType()` with Zod fields generates TS types, admin form and API validation [A1]
- Custom field types as packages (schema + React editor + renderer), no core changes [A2]
- Schema versioning with migration functions and dry-run counts [A3]
- `cli sync schemas` to diff and apply schemas between environments [A4, P1]

**Editing and publishing (editor)**
- Lazy tree of 5,000+ nodes with drag-and-drop move/reorder, URI rebuild and 301s [B1]
- Draft editing with 10 s autosave; drafts never affect the live site [B2]
- Expiring (24 h) preview links rendering the draft on the real site layout [B3]
- Publish now or schedule (site time zone); cache purge within 10 s [B4]
- Version history (author, time, AI or human) with diff and restore-as-draft [B5]
- Media library: drag-drop upload to object storage, resize/crops, alt text required before publish [B6]
- Per-locale field values with fallback to the default locale [B7, P1]
- Trash with 30-day soft delete and restore [FR-1.6]

**Rendering and extensions (developer)**
- `create-base-app` scaffolds a Next.js site wired to the API with sample types [C1]
- Registry mapping content type to layout and block to component; unknown blocks fail loudly in dev [C2]
- Typed hooks, sync (2 s timeout, can cancel) or async on BullMQ with retries [C3]
- `defineExtension()` packaging, installed via npm + CLI [C4]
- Sitemap, robots.txt, structured data, per-page Markdown and `llms.txt` [FR-7.3, AI-6]

**Admin and access (site admin)**
- Invite users by email (Resend) and assign roles [D1]
- Subtree policies enforced in the core [D2]
- Multiple sites per install with their own domains, locales, settings and content [D3]
- Audit log filterable by user, agent, action and date [D4]

**APIs and apps (app developer)**
- Delivery API + generated typed SDK, usable from React Native [E1]
- Signed webhooks with retries, backoff and a delivery log [E2]
- Scoped, revocable API tokens with last-used time [E3]

**AI (AI pack; runs on the site's own provider keys in v1)**
- Bring-your-own keys: each site stores its own Anthropic and Voyage keys, sealed at rest; AI is off until keys are set [G-7]
- Embeddings on publish and permission-aware semantic search [F1, AI-1, AI-2]
- Draft from a brief, validated against the content type schema, saved as draft only [F2, AI-3]
- One-click field actions shown as accept/reject diffs: rewrite, translate, summarize, SEO meta, alt text [F3, AI-4]
- MCP server mirroring Admin API commands; publish needs human approval by default [F4, AI-5]
- Per-site monthly AI budget, usage dashboard, alert at 80% and hard stop at 100% [F5, G-4; P0, promoted from P1]

**Non-goals for v1**

- Drag-and-drop visual page builder (v2, H3)
- Running existing MODX PHP extras or importing MODX packages
- Public extension marketplace, or untrusted third-party code in SaaS (v2, H1/H2)
- E-commerce module
- Multi-step approval workflows (v1.1, G4), GraphQL (later, only if asked)
- Multi-tenant SaaS, billing and quotas (v1.1)

**v1.1 (about 8 weeks after v1 GA):** one-command cloud deploy [G1], multi-tenant
isolation with per-tenant domains and quotas [G2], checkout, plans and license keys
[G3], approval workflows [G4], SSO via Clerk [G5, P1], Expo starter with push [G6, P1],
RAG chat over site content [G7, P1], content relations UI and bulk edit, custom admin
pages from extensions, blog and docs starters, extension registry, and hosted AI
credits (the paid AI pack) through a metered AI gateway.

**v2 (ecosystem):** marketplace with revenue share [H1], sandboxed third-party code
(isolated-vm or WASM) [H2], visual page builder producing the same block data [H3],
rule-based agent publishing [H4], more starters and optional GraphQL [H5].

## 4. Data - What are we storing?

All tenant data carries `site_id` (and, from v1.1, `tenant_id`) and is protected by
Postgres row-level security. Field content is JSONB validated by the content type's Zod
schema at the version it was written with.

- **Sites:** name, time zone, default locale, enabled locales, settings, AI settings
  (provider, budget, agent-publishing switch) and the site's own AI provider keys
  (sealed with `SECRETS_KEY`, never returned by the API or written to the audit log).
- **Domains:** host to site mapping, primary flag (TLS automation is v1.1).
- **Content type registry snapshot:** the code-defined schemas, recorded per version with
  a hash so the database knows which schema version each version's data was written with.
- **Entries (tree nodes):** site, parent, sort order, slug, computed URI and materialized
  path, content type, published version pointer, scheduled publish/unpublish times,
  soft-delete time.
- **Versions:** immutable snapshots of an entry's field data per locale, with status
  (draft, published, superseded), schema version, author, actor type (user, agent,
  system), and the AI metadata when an AI produced it.
- **Redirects:** old URI to new URI (301), created automatically on move or slug change.
- **Media:** object-storage key, filename, MIME type, size, dimensions, focal point,
  per-locale alt text, plus derived variants (sizes and crops).
- **Users, memberships and roles:** Clerk user id, email, per-site role.
- **Policies:** subtree grants and denies per user (or token) on a tree node.
- **Invitations:** email, role, site, token hash, expiry.
- **API tokens:** hashed secret, prefix, site, scopes (read/write, subtree, command list),
  kind (app or agent), created by, last used, revoked.
- **Preview tokens:** entry, version, hashed token, expiry (24 h).
- **Webhooks and deliveries:** endpoint, events, signing secret (sealed), and one delivery
  row per attempt with status, response code and next retry.
- **Audit log:** append-only; actor type and id, action, target, before/after diff, and
  for AI writes the model, prompt template id, token counts.
- **AI:** embedding chunks (pgvector) per published version and locale; AI usage events;
  monthly budget per site; publish requests created by agents awaiting approval.
- **Licenses (v1.1):** license key, production domains, plan, status (see section 6).
  Not stored in v1, where AI runs on the site's own keys.
- **Extensions installed:** name, version, enabled per site, settings values. (Extension
  *code* lives in npm packages, never in the database.)

## 5. Tech - What stack are we using?

From the PRD and its requirements. Items marked **TODO** must be settled in the
architecture doc before Feature 1.

- **Language:** TypeScript (strict) everywhere; ESM; Node.js LTS.
- **Monorepo:** pnpm workspaces + Turborepo (scaffolded; Biome for lint and format,
  Vitest for tests, `pnpm verify` as the umbrella check). Planned packages: `core` (content
  engine, commands, permissions), `schema` (`defineContentType`, field types, codegen),
  `api` (Delivery + Admin), `admin` (Next.js admin app), `worker` (BullMQ), `sdk`
  (generated client), `cli`, `mcp`, `create-base-app`, `starter-next`, and paid
  `@base/ee-*` packages kept separate (see section 6).
- **API server:** Fastify (decided). Must expose Delivery and Admin APIs and run on
  Railway or any Docker host.
- **Database:** PostgreSQL 16+ with JSONB, `ltree` or materialized paths for the tree,
  pgvector for embeddings, row-level security for site isolation.
- **ORM / migrations:** Drizzle with `pg` (decided), migrations generated by drizzle-kit.
  Framework migrations are forward-only and must work with the previous release's code.
- **Validation:** Zod for fields, commands, API input and AI structured output.
- **Queue / cache:** Redis + BullMQ for scheduled publish, async hooks, webhooks,
  embeddings, image variants and cache purges.
- **Admin app:** Next.js (App Router) + React; component library **TODO** (shadcn/ui
  suggested); rich text editor **TODO** (Tiptap or Lexical) storing structured JSON.
- **Site starter:** Next.js with cache tags and on-demand revalidation.
- **Auth:** Clerk for people (behind an auth adapter so self-hosters can swap in
  Auth.js/Lucia); hashed scoped tokens for apps and agents.
- **Media storage:** Cloudflare R2 via an S3-compatible storage adapter (local disk adapter
  for development). **Assumption:** image resizing with `sharp` in the worker.
- **Email:** Resend (invites, alerts).
- **AI:** Claude Sonnet 5.5 for drafts, rewrites and translation; Claude Haiku 5.5 for
  alt text, summaries, tagging and SEO meta; Voyage AI for embeddings. All behind a
  provider adapter; a site can switch or disable AI.
- **Agents:** Model Context Protocol server exposing Admin API commands as tools.
- **Observability:** Sentry, structured JSON logs, BullMQ dashboard.
- **Testing:** unit tests on core (80%+ coverage), integration tests against real Postgres,
  Playwright E2E for every P0 story, Lighthouse CI on the starter.
- **Billing (v1.1):** Lemon Squeezy or Stripe (**TODO**), feature flags per plan.

## 6. Monetize - How will this make money?

Open core. The core is free and MIT-licensed forever; revenue comes from add-ons that
businesses with live sites need, starting with AI. Prices are proposals to validate with
the first 10 production sites.

| Tier | Includes | Proposed price | Ships |
| --- | --- | --- | --- |
| **Core** | Content engine, tree, typed fields, versions, drafts, preview, scheduling, admin, APIs, SDK, extensions, CLI, Next.js starter | Free (MIT) | v1 |
| **AI pack** | Hosted AI credits for assistants, semantic search, MCP agent server, AI budgets and usage dashboard, model routing | ~$19 per site/month incl. credits, then usage-based | v1.1 (v1 AI features run on the site's own keys) |
| **Team / Agency** | Multi-site and multi-tenant, approval workflows, SSO, extended audit retention, white-label admin, priority support | ~$99 per organization/month | v1.1 |
| **Cloud** | Managed API, workers, Postgres, Redis, storage, backups, one-command deploy | From ~$25/month + usage | v1.1 |
| **Marketplace** | Paid community extensions | Revenue share (e.g. 20%) | v2 |

**Packaging rules**

1. Never paywall anything a solo developer needs to build and launch a site.
2. Paid features live in separately licensed packages (`@base/ee-*`); the core never
   imports them. The core exposes extension points that ee packages plug into.
3. Paid add-ons unlock with a license key per production domain; `localhost` and staging
   are always free.
4. **v1: bring your own key.** Every environment, production included, runs AI on the
   site's own Anthropic and Voyage keys; the site pays its providers directly and we
   bill nothing for AI. From v1.1, production sites can instead buy the AI pack's hosted
   credits; bring-your-own-key stays available.
5. Plan changes take effect immediately via feature flags.

**Consequence of bring-your-own-key:** v1 earns no AI revenue; paid tiers, license keys
and hosted credits all start in v1.1 (Features 44 and 54).

**Conflict to resolve (see section 13):** "multi-site" is both a free v1 P0 (D3) and a
Team/Agency feature.

## 7. UI/UX - How should this look and feel?

**Admin app:** calm, fast, keyboard-first, in the spirit of MODX's manager but modern.
Responsive down to tablet width; WCAG 2.1 AA.

- **Shell:** left pane = resource tree (search, lazy children, drag handles, status dots for
  draft / scheduled / published / unpublished changes), right pane = the selected entry.
  Site switcher at the top for multi-site installs.
- **Entry editor:** form rendered from the schema (tabs and groups from admin hints),
  autosave indicator, Preview, Publish / Schedule split button, version history drawer
  with diff and restore. Locale switcher when the site has more than one locale.
- **AI affordances:** a small sparkle action on eligible fields opens rewrite / translate /
  summarize / SEO / alt text; results always appear as a diff to accept or reject. "Draft
  from brief" on the create-entry dialog. AI-made versions carry an AI badge.
- **Media library:** grid with drag-drop upload, crops, focal point, alt text editor,
  "used in" list.
- **Settings:** users and roles, subtree policies, sites and domains, locales, tokens,
  webhooks (with delivery log), AI budget and usage, audit log.
- **Pending approvals:** agent publish requests appear as a queue with diff, approve,
  reject.

**Main admin routes** (**Assumption**)

- `/` - tree + dashboard (recent edits, scheduled, pending approvals)
- `/entries/:id` - entry editor; `/entries/:id/versions` - history
- `/media` - media library
- `/settings/{users,roles,sites,locales,tokens,webhooks,ai,audit}`

**Site starter:** a clean, accessible Next.js site (Lighthouse ≥ 90, WCAG 2.1 AA) that
shows layouts, blocks, loaders, navigation from the tree, preview mode and SEO outputs.
Developers own every element of markup.

**Usability bar:** an editor creates and publishes a page in ≤ 2 minutes with no developer
help (usability test with 3 editors).

## 8. Deployment - Where and how will this ship?

**Reference deployment (v1):**

| Piece | Host | Notes |
| --- | --- | --- |
| Admin app (Next.js) | Vercel | Or self-hosted on Railway |
| Site (Next.js starter) | Vercel | One project per client site; host resolves to site |
| API (Delivery + Admin + MCP over HTTP) | Railway | Docker image; health check `GET /healthz` (**Assumption**) |
| Worker (BullMQ) | Railway | Same image, different start command |
| Postgres 16 + pgvector | Railway | Daily backups, 30-day retention, monthly restore test |
| Redis | Railway | Queues and cache |
| Media | Cloudflare R2 | Public bucket or CDN in front |

**Distribution:** npm packages under `@base/*`; `create-base-app` scaffolder; a
Docker image for API + worker; `docker compose` for local Postgres + Redis.

**Env vars (by name, Assumption):** `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `MEDIA_PUBLIC_URL`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY`
(optional install-wide defaults for local development; production sites use their own
keys set in the admin),
`SECRETS_KEY` (seals webhook secrets), `PREVIEW_SECRET`, `REVALIDATE_SECRET`,
`SENTRY_DSN`, `TELEMETRY` (opt-in). `LICENSE_KEY` arrives in v1.1.

**Jobs:** scheduled publish/unpublish (minute accuracy), async hooks, webhook delivery
(exponential backoff for 24 h), embeddings, image variants, cache purge, trash purge
(30 days), AI budget alerts.

**Environments:** local (Docker), staging, production. Staging and `localhost` never need
a license key (v1.1).

## 9. Usage model and constraints

- **Scale at launch:** agency client sites. Up to 50,000 entries per site without query
  degradation; 25 concurrent editors per site; several sites per install.
- **Reachability:** Delivery API and sites are internet-facing; admin and Admin API are
  internet-facing behind Clerk; MCP is reachable only with an agent token.
- **Trust:** editors and admins are trusted within their role; agents are *not* trusted
  beyond their token scope; delivery API callers are anonymous unless they hold a token.
- **Tenancy:** v1 is multi-site within one organization (site id on every row, RLS).
  Multi-tenant SaaS with untrusted tenants is v1.1 and must pass automated isolation tests.
- **Extensions:** only first-party and the developer's own npm code in v1. No untrusted
  third-party code runs anywhere until sandboxing (v2).

**Non-functional targets**

| Area | Target |
| --- | --- |
| Delivery API latency | p95 ≤ 150 ms uncached, ≤ 50 ms cached |
| Admin entry editor load | ≤ 1.5 s on broadband |
| Publish to live | ≤ 10 s including cache purge |
| Delivery API uptime | 99.9% monthly |
| Backups / recovery | Daily, 30-day retention, monthly restore test; RPO ≤ 24 h, RTO ≤ 4 h |
| Security | Clerk sessions; hashed tokens; secrets only in env vars; OWASP Top 10; rate limits on all public endpoints |
| Privacy | Audit-logged access to personal data; delete-user flow; Brunei PDPO compatibility **TODO** (confirm with counsel) |
| Accessibility | Admin and starter WCAG 2.1 AA; starter Lighthouse ≥ 90 |
| Quality | ≥ 80% coverage on core; E2E for all P0 stories; 0 data-loss incidents |
| Portability | Storage, auth and AI providers behind adapters |

**Explicit non-requirements for v1:** SSO, approval chains, per-tenant TLS automation,
GraphQL, untrusted-code sandboxing, e-commerce.

## 10. Core rules (must not break)

These are the invariants every feature spec must respect. Put them into `AGENTS.md`
during `/onboard` once the code exists.

1. **No code in the database.** Content types, fields, hooks, blocks and extensions are
   code; the database stores data and a registry snapshot only.
2. **Versions are immutable.** Edits create new versions; restore creates a new draft.
   Published content changes only by publishing a version.
3. **Drafts never reach the Delivery API** unless a valid, unexpired preview token is
   supplied.
4. **Every write is a typed command** (Zod input, permission check, audit entry in the same
   transaction). UI, Admin API, CLI and MCP share it. No other write path exists.
5. **Permissions are enforced in the core**, never only in the UI. Subtree policies apply
   to descendants. Every new route ships with a forbidden-path test.
6. **Site isolation:** every tenant query filters by `site_id`, backed by RLS. Every new
   route ships with a cross-site test.
7. **Moves keep URLs alive:** a move or slug change rebuilds descendant URIs and writes
   301 redirects in the same transaction.
8. **AI writes drafts only** (unless the site enables agent publishing), is validated
   against the schema (retry once, then error, never partial), is budgeted, and is logged
   with model, prompt template id, token counts and diff.
9. **Private fields never leave** to a model provider; no customer data is used for training.
10. **Schema changes that affect data** need a version bump and a migration function, with a
    dry-run count before apply.
11. **Jobs are idempotent** with deterministic job ids; webhooks are signed (HMAC) and retried.
12. **Secrets:** tokens and preview links stored hashed; webhook secrets sealed; nothing
    secret returned by the API or written to the audit log.
13. **Core never depends on `@base/ee-*`.**

## 11. Success metrics

| Metric | Target | How measured |
| --- | --- | --- |
| Production sites on the framework | ≥ 1 by Gate 2; ≥ 10 within 6 months of v1 GA | Opt-in telemetry (license keys from v1.1) |
| GitHub stars | 1,000 within 6 months of public launch | GitHub |
| Weekly CLI installs | 500 within 6 months of public launch | npm |
| Free to paid conversion | ≥ 5% of production sites on a paid add-on | Billing |
| Time to model a new site | ≤ 1 day for a 10-template site | First 3 sites |
| Editor create-and-publish | ≤ 2 minutes, no developer help | Usability test, 3 editors |
| Delivery API latency | p95 ≤ 150 ms uncached, ≤ 50 ms cached | API monitoring |
| Starter Lighthouse performance | ≥ 90 | Lighthouse CI |
| AI drafts accepted with light edits | ≥ 60% | Draft to publish ratio in audit log |
| Data-loss incidents caused by framework | 0 | Incident log |

## 12. Milestones and gates

The PRD's milestone diagram (5 milestones, 4 gates) did not come through in the export;
the split below is **reconstructed** from its text (v1 GA after about 21 weeks across
M0-M3, v1.1 about 8 weeks later, at least one production site by Gate 2). Confirm the
week counts. A milestone is done only when its exit criterion is met on real work and
every P0 story it covers passes its acceptance criteria.

| Milestone | Weeks (Assumption) | Covers | Exit gate |
| --- | --- | --- | --- |
| **M0 Foundations** | 1-3 | Monorepo, schema engine, tree storage, auth, command bus, audit | Content types defined in code produce types, validation and a stored, audited entry |
| **M1 Editing core** | 4-10 | Admin app, tree UI, drafts, versions, publish, scheduling, media, roles, sites | **Gate 1:** the pilot site is fully modeled and edited by a real editor in staging |
| **M2 Rendering and APIs** | 11-15 | Delivery API, SDK, starter, preview, cache purge, hooks, extensions, webhooks, tokens | **Gate 2:** the pilot site is live in production on the framework |
| **M3 AI pack and GA** | 16-21 | Bring-your-own keys, embeddings, search, assistants, MCP, AI budget, hardening, docs | **Gate 3 (v1 GA):** an agent drafts content over MCP that an editor approves and publishes; NFR targets met |
| **M4 v1.1 Cloud, Team, apps** | +8 | G1-G7 | **Gate 4:** a paying customer runs on Cloud or the Team pack |

## 13. Risks, decisions and open questions

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scope creep from MODX parity | v1 slips by months | Non-goals list; P1 items move to v1.1 by default |
| Free core is "enough" | No revenue | Paid tiers target business needs (AI, governance, hosting); track conversion from the first production sites |
| Funded competitors add the same features | Differentiation fades | Lead on tree-first + MCP agents; ship fast; build community early |
| No real pilot site at M1 | Gates cannot be proven | Line up a site before M1 starts |
| Schema migrations corrupt content | Data loss | Immutable versions, dry-run migrations, daily backups |
| AI output quality or cost | Editors stop trusting AI; margins shrink | Drafts only, Zod validation, budgets, route to Haiku where possible |
| Solo founder running Cloud | On-call burden | Launch Cloud only after v1 is stable; managed infrastructure |
| Clerk is a hosted dependency for an MIT self-hosted core | Friction for self-hosters | Auth adapter in v1; document a non-Clerk adapter early |

**External dependencies and fallbacks:** Clerk (Auth.js or Lucia via adapter), Vercel
(self-host Next.js on Railway), Railway (any Docker host + managed Postgres), Cloudflare
R2 (S3-compatible adapter), Anthropic (provider adapter), Voyage AI (other provider plus a
re-embed job).

**Contradictions found while converting the PRD (decide, then update this plan)**

- **Decided - Bring-your-own-key for v1.** Sites run AI on their own provider keys; no
  license check or AI billing in v1. Hosted credits and the paid AI pack start in v1.1.
- **Planned - Hosted AI credits** need a metered AI gateway (keys, metering, billing).
  It is v1.1 Feature 54, after checkout and license keys (Feature 44).
- **TODO - Multi-site is free or paid?** D3 is a free v1 P0, yet the Team/Agency tier
  lists multi-site. Suggested reading: multi-site per install is free; multi-*tenant*
  SaaS is paid.
- **Decided - AI budgets are P0** (F5 promoted), so guardrail G-4 holds at v1 GA and a
  site's own provider bill stays capped.
- **TODO - Alt text required before publish** (B6) blocks publishing for any image with
  no alt text; decide whether decorative images can be marked as such.
- **TODO - Rich text format:** structured JSON from which editor (Tiptap/ProseMirror or
  Lexical)? It fixes the stored shape for every site.

**Open questions from the PRD**

- [ ] Which real site (yours or an early adopter's) is the pilot for M1-M2?
- [ ] Paid-code licence: separate private packages or a source-available `ee/` folder? Decide before M3.
- [x] Product name: **Base**.
- [ ] Domain.
- [ ] Is agent auto-publishing ever allowed in v1, or only from v1.1?
- [ ] Public launch timing: open the repo at v1 beta or at v1 GA?
- [ ] Cloud hosting regions and data residency for Southeast Asian customers.
