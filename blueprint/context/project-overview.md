# Base - Project Overview

<!-- blueprint:source-hash f02c36a52dedddddb22728509ce06a1a349ab57dbb2e284ba73cb089939916fd -->

> The tree-first CMS for developers, editors and AI agents. An MIT-licensed, TypeScript
> CMS with MODX's resource tree, a schema-driven admin, and permissioned AI agents over
> MCP. One Next.js app (website, admin and APIs) runs on one Supabase project; power users
> can switch on the Scale pack later. Paid add-ons (AI credits, Team, Cloud) fund it.

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
- Website and Delivery API internet-facing; admin and Admin API behind Supabase Auth; MCP only with agent tokens; `/api/jobs/run` only with `JOBS_SECRET`; Base's tables never exposed through Supabase's Data API.
- Agents untrusted beyond token scope; editors trusted within role.
- v1 is multi-site in one organization (site id + RLS). Untrusted multi-tenant SaaS is v1.1.
- Only first-party and the developer's own npm code runs; no untrusted extensions until v2.
- Targets: Delivery p95 ≤ 150 ms uncached / ≤ 50 ms cached; editor load ≤ 1.5 s; publish to live ≤ 10 s; 99.9% uptime; daily backups, 30-day retention, RPO ≤ 24 h, RTO ≤ 4 h; WCAG 2.1 AA; site Lighthouse ≥ 90; ≥ 80% core coverage and E2E for every P0 story.
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
9. Jobs idempotent with deterministic ids, stored in Postgres, runnable from Supabase Cron and the worker; webhooks HMAC-signed and retried.
10. Tokens and preview links stored hashed; webhook secrets and AI provider keys sealed; secrets never returned or audited.
11. The core never depends on `@base/ee-*`.
12. Base's tables are reachable only through Base; the Supabase service-role key never reaches the browser.
13. Providers only behind adapters (auth, storage, jobs, API host), each passing a shared conformance suite.

## Architecture

One Next.js app, `apps/web`: the public website at `/` (host resolves to site, path to
entry), the admin at `/admin`, and route handlers at `/api` (Admin API, Delivery API,
jobs, MCP). Server components read content through `core`, not over HTTP. API handlers
use web-standard `Request`/`Response`, so the Scale pack's Fastify server can serve the
same ones. Packages: `schema`, `db`, `core`, `web`, `sdk`, `cli`, `create-base-app`;
paid `@base/ee-*` and Scale `@base/scale-*` packages stay separate.

| Adapter | Default (Supabase stack) | Scale pack (power users) |
| --- | --- | --- |
| Auth | Supabase Auth | Clerk |
| Storage | Supabase Storage | S3-compatible (R2, AWS S3) |
| Jobs | Postgres queue run by Supabase Cron (or `base worker`) | BullMQ on Redis workers |
| API host | Next.js route handlers | Standalone Fastify server |

The database is Postgres through Drizzle in every setup (Supabase, Railway or any
Postgres 16+). Switching to the Scale pack changes configuration and deployment, not site code.

## Features

Build order from `build-plan.md` (restructured 2026-10-28; Features 1-6 were built on
Fastify + Clerk and are moved by 7-10). Headline: **Feature 44, MCP server** (with 42 and
45 it proves Gate 3).

**M0 Foundations** (done)
1. **Content type definitions** - `defineContentType()` with Zod fields, types and validation.
2. **Sites and the content tree** - sites, domains, locales; tree with slug and URI.
3. **Typed commands and audit log** - the single audited write path.
4. **Sign-in and roles** - auth adapter (Clerk then); five roles enforced in core.
5. **Drafts and immutable versions** - per-locale version chains; drafts isolated from live.

**M1 Editing core (Gate 1: pilot modeled and edited in staging)**
6. **Admin shell and tree** (done) - lazy tree to 5,000 nodes, site switcher.
7. **Supabase database** - migrations, RLS and `cms_app` on Supabase; Data API closed.
8. **One app** - admin at `/admin`, API as shared route handlers; Fastify kept for Scale.
9. **Supabase Auth** - default auth adapter; Clerk adapter kept; one conformance suite.
10. **Background jobs** - job adapter, Postgres queue, Supabase Cron, `base worker`.
11. **Schema-driven entry editor** - generated forms, 10 s autosave.
12. **Move, reorder and redirects** - drag-and-drop, URI rebuild, 301s.
13. **Publish and version history** - publish/unpublish, diff, restore.
14. **Scheduled publishing** - minute-accurate jobs in the site time zone.
15. **Media library** - Supabase Storage upload, variants and crops, alt text required.
16. **Users and invitations** - Supabase Auth invites, assign roles.
17. **Subtree policies** - node grants inherited by descendants.
18. **Multi-site management** - per-site domains, locales, settings.
19. **Audit log screen** - filter by user, agent, action, date.
20. **Trash and restore** - 30-day soft delete.
21. **Custom field types** - field packages without core changes.
22. **Schema versions and migrations** - version bump, migration, dry run.
23. **Localized content** (P1) - per-locale values with fallback.

**M2 Rendering and APIs (Gate 2: pilot live in production)**
24. **Website rendering** - host to site, path to published entry, developer layouts.
25. **Layouts, blocks and loaders** - registry; unknown blocks fail in dev.
26. **Delivery API** - published entries by URI/ID, children, queries.
27. **Scoped API tokens** - hashed, scoped, revocable, last-used.
28. **Codegen and typed SDK** - types and client, React Native compatible.
29. **create-base-app** - scaffolds the app with sample types, linked to Supabase.
30. **Preview links** - 24 h draft preview on the real layout.
31. **Publish to live in 10 seconds** - cache tags revalidated in the app, CDN purge.
32. **Content hooks** - sync (2 s, cancellable) and async on the job queue.
33. **Extensions** - `defineExtension()` manifest, npm + CLI install.
34. **Webhooks** - signed events, 24 h backoff, delivery log.
35. **SEO and agent-readable outputs** - sitemap, robots, structured data, Markdown, `llms.txt`.
36. **Production readiness** - rate limits, Sentry, logs, jobs screen, health check, tested restore.
37. **Scale-ready core** - one config selects adapters; conformance suites in CI; Dockerfile.
38. **Schema sync CLI** (P1) - diff and apply schemas across environments.

**M3 AI pack and GA (Gate 3: agent draft approved and published)**
39. **AI provider adapter and model routing** - Sonnet/Haiku routing, logging, private-field filter, off switch.
40. **Embeddings pipeline** - Voyage vectors in pgvector via the job queue.
41. **Semantic search** - permission-aware, admin and Delivery API.
42. **Draft from a brief** - schema-validated AI drafts.
43. **Field AI actions** - rewrite, translate, summarize, SEO, alt text as diffs.
44. **MCP server** - an MCP route; Admin API commands as scoped tools (free core).
45. **Publish approvals for agents** - approval queue; agent-publishing switch.
46. **AI budget and usage** - monthly budget, dashboard, 80% alert, 100% stop.
47. **Bring-your-own AI keys** - per-site Anthropic and Voyage keys, sealed; AI off until set.
48. **Personal data controls** - delete-user flow, audited personal-data access.

**v1.1 (Gate 4: first paying Cloud or Team customer)**
49. **Multi-tenant isolation** - tested RLS isolation, tenant domains with TLS, quotas.
50. **Plans, checkout and license keys** - billing; add-ons unlock within a minute.
51. **One-command cloud deploy** - Supabase project + app, live in under 10 minutes.
52. **Approval workflows** - approval steps per site or subtree.
53. **Company SSO** (P1) - SAML via Supabase Auth.
54. **Expo starter app** (P1) - native blocks, push on publish.
55. **Ask your site** (P1) - cited, permission-aware RAG answers.
56. **Content relations and bulk edit**.
57. **Custom admin pages from extensions**.
58. **Blog and docs starters**.
59. **Extension registry**.
60. **Hosted AI credits** - paid AI pack via a metered AI gateway.

**Scale pack (Gate 5: a site switches by configuration alone)**
61. **Standalone API server** - Fastify serving the same handlers, on Railway.
62. **Redis job workers** - BullMQ job adapter and workers on Railway.
63. **Clerk auth adapter** - packaged from Feature 4, conformance-tested.
64. **S3/R2 storage adapter** - conformance-tested, with a media copy tool.
65. **Upgrade to the Scale pack** - `cli scale` switch with dry run and a way back.

v2 (untracked): marketplace, sandboxed third-party code, visual page builder, rule-based agent publishing, GraphQL.

## Data model

All tenant tables carry `site_id` (plus `tenant_id` from Feature 49) under RLS. Field
content is JSONB validated by the content type's Zod schema. **Locked by Features 2, 3 and 5:** `entries`, `versions`
and `audit_log` shapes; later features add columns, never reshape them.

### Site
- `id`, `name`, `timeZone` (IANA), `defaultLocale`, `locales` (text[]), `settings` (jsonb), `aiSettings` (jsonb: provider, enabled, agentPublishing), `aiKeys` (sealed own provider keys; never returned or audited)
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
- User: `id`, `authId` (auth adapter subject: Supabase Auth user id by default), `email`, `name`, `deletedAt`
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

### Job
- `id` (deterministic), `type`, `payload` (jsonb), `runAt`, `attempts`, `lastError`, `status` (queued | running | done | failed)

### AI (Features 39-47; License from v1.1)
- EmbeddingChunk: `siteId`, `entryId`, `versionId`, `locale`, `chunkIndex`, `text`, `embedding` (vector)
- AiUsage: `siteId`, `actorType`, `actorId`, `task`, `model`, `inputTokens`, `outputTokens`, `createdAt`
- AiBudget: `siteId`, `month`, `tokenLimit`, `alertedAt80`
- PublishRequest: `siteId`, `entryId`, `versionId`, `requestedByToken`, `status` (pending | approved | rejected), `decidedBy`, `decidedAt`
- License (v1.1, Feature 50): `key`, `domains` (text[]), `plan`, `status`, `validUntil`

### InstalledExtension
- `siteId`, `name`, `version`, `enabled`, `settings` (jsonb)

## Tech stack

- **TypeScript (strict, ESM), Node.js LTS, pnpm + Turborepo, Biome** - all packages; `pnpm verify` is the umbrella check.
- **Next.js (App Router) + React** - the one app: website, admin (shadcn/ui + Tailwind CSS), route-handler APIs, MCP; rich text TODO (Tiptap or Lexical) stored as JSON.
- **Supabase** - Postgres 15+ (pgvector, RLS via `cms_app` and `withSite()`, session pooler), Auth (default auth adapter), Storage (default media adapter), Cron (runs jobs).
- **Drizzle + pg** - ORM; forward-only migrations compatible with the previous release.
- **Zod** - fields, commands, API input, AI output.
- **Postgres job queue** in `core` - scheduling, hooks, webhooks, embeddings, variants, revalidation; `base worker` for long-running use.
- **Next.js cache tags** - publish revalidates in the same app.
- **Email** - Supabase Auth mailer (custom SMTP in production); Resend optional.
- **Claude Sonnet 5.5 / Claude Haiku 5.5 / Voyage AI** - drafts and rewrites / short tasks / embeddings, behind a provider adapter.
- **MCP** - agent interface, a route in the app, free core.
- **Sentry, structured logs, admin jobs screen** - observability.
- **Vitest** (≥ 80% core coverage), integration tests against real Postgres, **Playwright** E2E for every P0 story, **Lighthouse CI** on the site.
- **Scale pack (later):** Fastify API server, BullMQ + Redis, Clerk, S3/R2, on Railway.
- **Lemon Squeezy or Stripe** (v1.1, TODO) - billing with per-plan feature flags.

## Monetization

Open core: Core free (MIT), including the MCP agent server. **v1 AI runs on each site's own provider keys; no AI revenue in v1.**
**AI pack** (hosted credits) ~$19/site/month with credits then usage (v1.1).
**Team/Agency** ~$99/org/month (v1.1). **Cloud** from ~$25/month + usage (v1.1). Scale pack free or paid: TODO.
**Marketplace** revenue share (v2). Paid code in `@base/ee-*`; license key per
production domain from v1.1; localhost and staging free; bring-your-own-key always allowed. Never
paywall what a solo developer needs to launch.

## UI/UX

Calm, fast, keyboard-first admin in the spirit of MODX's manager: tree on the left, entry
on the right; AI actions as accept/reject diffs; AI badges on AI-made versions. Tablet
width up; WCAG 2.1 AA. Editor creates and publishes a page in ≤ 2 minutes.

- `/admin` - sends a person to their first site
- `/admin/sites/:siteId` - tree and dashboard (recent edits, scheduled, pending approvals)
- `/admin/sites/:siteId/entries/:id` - entry editor; `.../versions` - history and diff
- `/admin/sites/:siteId/media` - media library
- `/admin/sites/:siteId/settings/{users,roles,locales,tokens,webhooks,ai,audit}` - setup screens
- Every other path is the public website, rendered by the same app; `create-base-app` ships an accessible default site.

## Deployment

- **Default (two services):** the Base app on Vercel (or any Node host); one Supabase project for Postgres + pgvector, Auth (custom SMTP), Storage (public bucket behind the CDN) and Cron (calls `/api/jobs/run` every minute). Supabase backups.
- **Step up:** `base worker` on Railway runs jobs long-running; Supabase Cron stays as a backstop.
- **Scale pack (power users, after v1.1):** standalone Fastify API, BullMQ workers + Redis on Railway, Clerk, R2 or S3; Postgres stays on Supabase or moves to Railway; the app on Vercel or Railway via the Docker image.
- **Distribution:** npm `@base/*` and `@base/scale-*`, `create-base-app`, optional Docker image, Supabase CLI for local development.
- **Env vars:** `DATABASE_URL` (session pooler), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `STORAGE_BUCKET`, `JOBS_SECRET`, `SECRETS_KEY`, `PREVIEW_SECRET`, `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` (optional dev defaults), `RESEND_API_KEY` (optional), `SENTRY_DSN`, `TELEMETRY`; `LICENSE_KEY` from v1.1. Scale pack adds `REDIS_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `MEDIA_PUBLIC_URL`, `API_URL`.
- **Jobs:** scheduled publish, async hooks, webhooks, embeddings, image variants, cache revalidation, trash purge, budget alerts.

## Open questions

> TODO: multi-site is a free v1 P0 (D3) and also listed in the paid Team tier.
> TODO: alt text required before publish; allow marking images decorative?
> TODO: rich text editor (needed by Feature 11); billing provider (v1.1); Scale pack free or paid (before the Scale pack).
> TODO: confirm assumptions: role matrix (before Feature 4), `GET /healthz`,
> `sharp` for image variants, env var names.
> TODO: milestone weeks are reconstructed; the PRD's milestone diagram was missing.
> From the PRD: pilot site for M1-M2; paid-code licence model (decide before M3);
> domain; agent auto-publishing in v1; launch at beta or GA; Cloud
> regions and Southeast Asian data residency; Brunei PDPO compatibility.
