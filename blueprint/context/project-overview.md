# <name> CMS - Project Overview

<!-- blueprint:source-hash ca0011eeff6cacfe85011ede30bafbe21223834dad69afc40a87632fcd3c3702 -->

> An MIT-licensed, TypeScript, API-first CMS framework with MODX's resource tree, a
> schema-driven admin for editors, and permissioned AI agents over MCP; paid add-ons
> (AI pack, Team, Cloud) fund it.

## Problem

MODX 3 is flexible but tied to PHP, server rendering and code stored in the database, so
React frontends, mobile apps and Git workflows are awkward. Headless CMSs are modern but
collection-first and lose the tree and developer freedom agencies rely on. No CMS lets AI
agents draft, edit and request publishing safely. v1 succeeds when one real client site
runs in production and an AI agent's draft is approved by an editor.

## Users

- **Developer** (primary) - defines content types in code, owns all markup, extends with npm, deploys with Git, for free.
- **Content editor** (primary) - finds pages in a tree, edits, previews, publishes, rolls back without a developer.
- **Site admin** - users, roles, subtree policies, domains, settings per site.
- **AI agent** - MCP client acting within a scoped token; drafts only, requests publish.
- **App developer** - typed cached Delivery API, SDK, webhooks.
- **Paying customer** - buys AI pack, Team or Cloud for a production site.
- Platform owner appears only in v1.1 (SaaS).

**Roles per site:** Owner, Admin, Editor, Author, Viewer. Authors draft and request
publish; Editors publish, move and delete; Admins manage users, policies, sites, tokens and
webhooks; Owners also control AI keys and budget, agent publishing and billing (matrix in
project-plan section 2 is an assumption to confirm). Subtree policies narrow or grant
rights per node and apply to descendants.

## Usage model

- Agency client sites: ≤ 50,000 entries and 25 concurrent editors per site; several sites per install.
- Delivery API and sites internet-facing; admin behind Clerk; MCP only with agent tokens.
- Agents untrusted beyond token scope; editors trusted within role.
- v1 is multi-site in one organization (site id + RLS). Untrusted multi-tenant SaaS is v1.1.
- Only first-party and the developer's own npm code runs; no untrusted extensions until v2.
- Targets: Delivery p95 ≤ 150 ms uncached / ≤ 50 ms cached; editor load ≤ 1.5 s; publish to live ≤ 10 s; 99.9% uptime; daily backups, 30-day retention, RPO ≤ 24 h, RTO ≤ 4 h; WCAG 2.1 AA; starter Lighthouse ≥ 90; ≥ 80% core coverage and E2E for every P0 story.
- Non-requirements for v1: visual page builder, MODX PHP compatibility, marketplace, e-commerce, SSO, approval chains, GraphQL.

## Core rules

1. No code stored in or executed from the database.
2. Versions are immutable; restore creates a new draft.
3. Drafts reach the Delivery API only with a valid preview token.
4. Every write is a typed Zod command with a permission check and a same-transaction audit entry; UI, Admin API, CLI and MCP share it.
5. Permissions and site isolation are enforced in the core (RLS + `site_id` filters); every route gets forbidden and cross-site tests.
6. Moves and slug changes rebuild descendant URIs and write 301 redirects atomically.
7. AI writes drafts only (unless agent publishing is enabled), validated (retry once, never partial), budgeted, and logged with model, template id, tokens and diff; private fields never sent to providers.
8. Data-affecting schema changes need a version bump, a migration function and a dry run.
9. Jobs idempotent with deterministic ids; webhooks HMAC-signed and retried.
10. Tokens and preview links stored hashed; webhook secrets and AI provider keys sealed; secrets never returned or audited.
11. The core never depends on `@<name>/ee-*`.

## Features

Build order from `build-plan.md`. Headline: **Feature 38, MCP server** (with 36 and 39 it
proves Gate 3).

**M0 Foundations**
1. **Content type definitions** - `defineContentType()` with Zod fields, types and validation.
2. **Sites and the content tree** - sites, domains, locales; tree with slug and URI.
3. **Typed commands and audit log** - the single audited write path.
4. **Sign-in and roles** - Clerk behind an adapter; five roles enforced in core.
5. **Drafts and immutable versions** - per-locale version data; drafts isolated from live.

**M1 Editing core (Gate 1: pilot modeled and edited in staging)**
6. **Admin shell and tree** - lazy tree to 5,000 nodes, site switcher.
7. **Schema-driven entry editor** - generated forms, 10 s autosave.
8. **Move, reorder and redirects** - drag-and-drop, URI rebuild, 301s.
9. **Publish and version history** - publish/unpublish, diff, restore.
10. **Scheduled publishing** - minute-accurate BullMQ jobs in site time zone.
11. **Media library** - R2 upload, variants and crops, alt text required.
12. **Users and invitations** - invite by email, assign roles.
13. **Subtree policies** - node grants inherited by descendants.
14. **Multi-site management** - per-site domains, locales, settings.
15. **Audit log screen** - filter by user, agent, action, date.
16. **Trash and restore** - 30-day soft delete.
17. **Custom field types** - field packages without core changes.
18. **Schema versions and migrations** - version bump, migration, dry run.
19. **Localized content** (P1) - per-locale values with fallback.

**M2 Rendering and APIs (Gate 2: pilot live in production)**
20. **Delivery API** - published entries by URI/ID, children, queries.
21. **Scoped API tokens** - hashed, scoped, revocable, last-used.
22. **Codegen and typed SDK** - types and client, React Native compatible.
23. **Site starter and create-app** - Next.js starter resolving host and path.
24. **Layouts, blocks and loaders** - registry; unknown blocks fail in dev.
25. **Preview links** - 24 h draft preview on the real layout.
26. **Publish to live in 10 seconds** - cache tags and purge.
27. **Content hooks** - sync (2 s, cancellable) and async with retries.
28. **Extensions** - `defineExtension()` manifest, npm + CLI install.
29. **Webhooks** - signed events, 24 h backoff, delivery log.
30. **SEO and agent-readable outputs** - sitemap, robots, structured data, Markdown, `llms.txt`.
31. **Production readiness** - rate limits, Sentry, logs, queue dashboard, health check, backups.
32. **Schema sync CLI** (P1) - diff and apply schemas across environments.

**M3 AI pack and GA (Gate 3: agent draft approved and published)**
33. **AI provider adapter and model routing** - Sonnet/Haiku routing, logging, private-field filter, off switch.
34. **Embeddings pipeline** - Voyage vectors in pgvector on publish.
35. **Semantic search** - permission-aware, admin and Delivery API.
36. **Draft from a brief** - schema-validated AI drafts.
37. **Field AI actions** - rewrite, translate, summarize, SEO, alt text as diffs.
38. **MCP server** - Admin API commands as scoped MCP tools.
39. **Publish approvals for agents** - approval queue; agent-publishing switch.
40. **AI budget and usage** - monthly budget, dashboard, 80% alert, 100% stop.
41. **Bring-your-own AI keys** - per-site Anthropic and Voyage keys, sealed; AI off until set.
42. **Personal data controls** - delete-user flow, audited personal-data access.

**v1.1 (Gate 4: first paying Cloud or Team customer)**
43. **Multi-tenant isolation** - tested RLS isolation, tenant domains with TLS, quotas.
44. **Plans, checkout and license keys** - billing; add-ons unlock within a minute.
45. **One-command cloud deploy** - live URL in under 10 minutes.
46. **Approval workflows** - approval steps per site or subtree.
47. **Company SSO** (P1) - SAML/OIDC via Clerk.
48. **Expo starter app** (P1) - native blocks, push on publish.
49. **Ask your site** (P1) - cited, permission-aware RAG answers.
50. **Content relations and bulk edit**.
51. **Custom admin pages from extensions**.
52. **Blog and docs starters**.
53. **Extension registry**.
54. **Hosted AI credits** - paid AI pack via a metered AI gateway.

v2 (untracked): marketplace, sandboxed third-party code, visual page builder, rule-based agent publishing, GraphQL.

## Data model

All tenant tables carry `site_id` (plus `tenant_id` from Feature 43) under RLS. Ids are
UUIDs; times are `timestamptz`. **Locked by Features 2, 3 and 5:** `entries`, `versions`
and `audit_log` shapes; later features add columns, never reshape them.

### Site
- `id`, `name`, `timeZone` (IANA), `defaultLocale`, `locales` (text[]), `settings` (jsonb), `aiSettings` (jsonb: provider, enabled, agentPublishing), `aiKeysSealed` (bytea, own provider keys; never returned)
- has many Domain, Entry, Media, Membership, ApiToken, Webhook

### Domain
- `siteId`, `host` (unique), `isPrimary` (bool)

### ContentTypeSchema (registry snapshot; definitions live in code)
- `siteId`, `key`, `version` (int), `hash`, `jsonSchema` (jsonb), `registeredAt`

### Entry (tree node)
- `id`, `siteId`, `parentId` (nullable self-ref), `sortOrder` (int), `slug`, `uri` (unique per site), `path` (materialized path or ltree)
- `typeKey`, `publishedVersionId` (nullable), `publishAt`, `unpublishAt`, `deletedAt`
- has many Version, Redirect

### Version (immutable)
- `id`, `entryId`, `siteId`, `locale`, `data` (jsonb), `schemaVersion` (int), `status` (draft | published | superseded)
- `actorType` (user | agent | system), `actorId`, `basedOnVersionId`, `createdAt`
- `ai` (jsonb, nullable: model, promptTemplateId, inputTokens, outputTokens)

### Redirect
- `siteId`, `fromUri` (unique per site), `toEntryId`, `status` (301), `createdAt`

### Media / MediaVariant
- Media: `id`, `siteId`, `storageKey`, `filename`, `mime`, `bytes`, `width`, `height`, `focalPoint`, `alt` (jsonb per locale), `decorative` (bool, TODO)
- MediaVariant: `mediaId`, `kind` (size or crop name), `storageKey`, `width`, `height`

### User, Membership, Policy, Invitation
- User: `id`, `clerkUserId`, `email`, `name`, `deletedAt`
- Membership: `userId`, `siteId`, `role` (owner | admin | editor | author | viewer)
- Policy: `siteId`, `subjectType` (user | token), `subjectId`, `entryId` (subtree root), `effect` (grant | deny), `actions` (text[])
- Invitation: `siteId`, `email`, `role`, `tokenHash`, `expiresAt`, `acceptedAt`

### ApiToken, PreviewToken
- ApiToken: `id`, `siteId`, `kind` (app | agent), `prefix`, `secretHash`, `scopes` (jsonb: read/write, subtree ids, commands), `createdBy`, `lastUsedAt`, `revokedAt`
- PreviewToken: `entryId`, `versionId`, `tokenHash`, `expiresAt` (24 h)

### Webhook, WebhookDelivery
- Webhook: `siteId`, `url`, `events` (text[]), `secretSealed`, `enabled`
- WebhookDelivery: `webhookId`, `eventId`, `attempt`, `status`, `responseCode`, `nextAttemptAt`

### AuditLog (append-only)
- `id`, `siteId`, `actorType`, `actorId`, `action`, `targetType`, `targetId`, `diff` (jsonb), `ai` (jsonb, nullable), `createdAt`

### AI (Features 33-41; License from v1.1)
- EmbeddingChunk: `siteId`, `entryId`, `versionId`, `locale`, `chunkIndex`, `text`, `embedding` (vector)
- AiUsage: `siteId`, `actorType`, `actorId`, `task`, `model`, `inputTokens`, `outputTokens`, `createdAt`
- AiBudget: `siteId`, `month`, `tokenLimit`, `alertedAt80`
- PublishRequest: `siteId`, `entryId`, `versionId`, `requestedByToken`, `status` (pending | approved | rejected), `decidedBy`, `decidedAt`
- License (v1.1, Feature 44): `key`, `domains` (text[]), `plan`, `status`, `validUntil`

### InstalledExtension
- `siteId`, `name`, `version`, `enabled`, `settings` (jsonb)

## Tech stack

- **TypeScript (strict), Node.js 22, pnpm + Turborepo, Biome** - all packages.
- **Fastify** - API server for Delivery, Admin and MCP-over-HTTP.
- **PostgreSQL 16 + pgvector + RLS** - content, tree, vectors, isolation.
- **Drizzle + pg** - ORM; forward-only migrations compatible with the previous release.
- **Zod** - fields, commands, API input, AI output.
- **Redis + BullMQ** - scheduling, hooks, webhooks, embeddings, variants, purges.
- **Next.js + React** - admin app and site starter; UI kit TODO (shadcn/ui suggested); rich text TODO (Tiptap or Lexical) stored as JSON.
- **Clerk** (behind auth adapter) - people; hashed scoped tokens for apps and agents.
- **Cloudflare R2** (S3 adapter, local disk in dev) - media; `sharp` for variants (assumed).
- **Resend** - invites and alerts.
- **Claude Sonnet 5.5 / Claude Haiku 5.5 / Voyage AI** - drafts and rewrites / short tasks / embeddings, behind a provider adapter.
- **MCP** - agent interface.
- **Sentry, structured logs, BullMQ dashboard** - observability.
- **Vitest-style unit + real-Postgres integration tests, Playwright E2E, Lighthouse CI** - quality gates.

## Monetization

Open core: Core free (MIT). **v1 AI runs on each site's own provider keys; no AI revenue in v1.**
**AI pack** (hosted credits) ~$19/site/month with credits then usage (v1.1).
**Team/Agency** ~$99/org/month (v1.1). **Cloud** from ~$25/month + usage (v1.1).
**Marketplace** revenue share (v2). Paid code in `@<name>/ee-*`; license key per
production domain from v1.1; localhost and staging free; bring-your-own-key always allowed. Never
paywall what a solo developer needs to launch.

## UI/UX

Calm, fast, keyboard-first admin in the spirit of MODX's manager: tree on the left, entry
on the right; AI actions as accept/reject diffs; AI badges on AI-made versions. Tablet
width up; WCAG 2.1 AA. Editor creates and publishes a page in ≤ 2 minutes.

- `/` - tree and dashboard (recent edits, scheduled, pending approvals)
- `/entries/:id` - entry editor; `/entries/:id/versions` - history and diff
- `/media` - media library
- `/settings/{users,roles,sites,locales,tokens,webhooks,ai,audit}` - setup screens
- Site starter: accessible Next.js site with layouts, blocks, preview mode and SEO outputs.

## Deployment

- **Admin + sites:** Vercel (or self-hosted Next.js on Railway).
- **API + worker:** one Docker image on Railway with two start commands; health check `GET /healthz` (assumed).
- **Postgres 16 + pgvector, Redis:** Railway; daily backups, 30-day retention, monthly restore test.
- **Media:** Cloudflare R2.
- **Distribution:** npm `@<name>/*`, `create-<name>-app`, Docker image, local `docker compose`.
- **Env vars:** `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_PUBLIC_URL`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` (optional dev defaults; sites use their own keys), `SECRETS_KEY`, `PREVIEW_SECRET`, `REVALIDATE_SECRET`, `SENTRY_DSN`, `TELEMETRY`; `LICENSE_KEY` from v1.1.
- **Jobs:** scheduled publish, async hooks, webhooks, embeddings, image variants, cache purge, trash purge, budget alerts.

## Open questions

> TODO: multi-site is a free v1 P0 (D3) and also listed in the paid Team tier.
> TODO: alt text required before publish; allow marking images decorative?
> TODO: rich text editor and UI kit.
> TODO: milestone weeks are reconstructed; the PRD's milestone diagram was missing.
> From the PRD: pilot site for M1-M2; paid-code licence model (decide before M3);
> product name and domain; agent auto-publishing in v1; launch at beta or GA; Cloud
> regions and Southeast Asian data residency; Brunei PDPO compatibility.
