# Build Plan

Features in build order, grouped by milestone. Each item is one feature-sized outcome;
`/feature` writes the detailed spec. PRD story and requirement IDs are in brackets so
specs, tests and tickets can cite them. Items marked (P1) move to v1.1 if the schedule
slips. Do not renumber completed features; their archived specs refer to these IDs.

Scaffolding the monorepo (pnpm + Turborepo, Docker Postgres/Redis, lint, test runner, CI)
is a pre-build step done before Feature 1, not a feature.

**Restructured 2026-10-28:** Base becomes one Next.js app (website, admin and APIs) on one
Supabase project. Auth, storage, jobs and the API host sit behind adapters so power users
can later switch on the Scale pack (Fastify server, Redis workers, Clerk, S3/R2 on
Railway); see `project-plan.md` sections 5 and 8. Features 1-6 keep their numbers;
Features 7-10 move what they built onto the new shape; later items were renumbered from 7.

## M0 - Foundations (weeks 1-3)

- [x] 1. **Content type definitions** - `defineContentType()` with Zod fields and the built-in field types produces TS types and API validation with field-level errors [A1, FR-2.1, FR-2.2]
- [x] 2. **Sites and the content tree** - sites with domains and locales; entries stored as a per-site tree with parent, sort order, slug and computed URI [FR-1.1]
- [x] 3. **Typed commands and audit log** - every write is a Zod-validated command with a permission check and an audit entry (user, agent or system) in the same transaction [FR-4.2, FR-6.3]
- [x] 4. **Sign-in and roles** - Clerk sign-in behind an auth adapter; Owner, Admin, Editor, Author, Viewer per site, enforced in the core [FR-6.1, FR-6.2]
- [x] 5. **Drafts and immutable versions** - field data stored per version and locale; saving creates a draft that never touches published content [FR-1.2, FR-1.3]

## M1 - Editing core (weeks 4-10) - Gate 1: pilot site modeled and edited in staging

- [x] 6. **Admin shell and tree** - admin app with site switcher and a lazily loaded tree that stays fast at 5,000 nodes [B1, FR-3.1]
- [ ] 7. **Supabase database** - Base's migrations, row-level security and the `cms_app` role run on Supabase (local `supabase start` and a hosted project) over the session pooler; Supabase's Data API cannot reach Base's tables [NFR Security, rule 14]
- [ ] 8. **One app** - `apps/web` serves the admin at `/admin` and the API as route handlers (`/api/me`, `/api/sites/:siteId/tree`) written once against web-standard `Request`/`Response`, with the same tests; the Fastify server leaves the default deploy and is kept for the Scale pack [FR-4.2, rule 15]
- [ ] 9. **Supabase Auth** - Supabase Auth (email and password, magic link, verified email only) becomes the default auth adapter; the Clerk adapter stays available; both pass one auth conformance suite and existing users keep their memberships [FR-6.1, rule 15]
- [ ] 10. **Background jobs** - a job adapter with a Postgres queue as default (deterministic ids, retries); Supabase Cron runs it every minute through a protected route, and the same runner works as a long-running `base worker` [rule 11, rule 15]
- [ ] 11. **Schema-driven entry editor** - forms rendered from content types with 10 s autosave of drafts [B2, FR-3.2, FR-3.5]
- [ ] 12. **Move, reorder and redirects** - drag-and-drop in the tree rebuilds descendant URIs and writes 301 redirects [B1, FR-1.4]
- [ ] 13. **Publish and version history** - publish or unpublish now; history shows author, time and AI/human actor with diff; restore creates a new draft [B4, B5, FR-3.3]
- [ ] 14. **Scheduled publishing** - publish and unpublish at a set time in the site time zone through the job queue, accurate to the minute [B4, FR-1.5]
- [ ] 15. **Media library** - drag-drop upload to Supabase Storage through the storage adapter, resize and crops, alt text required before publish [B6]
- [ ] 16. **Users and invitations** - admins invite users by email (Supabase Auth invitations) and assign roles [D1]
- [ ] 17. **Subtree policies** - grants on a tree node apply to descendants; denied actions are hidden and blocked by the API [D2]
- [ ] 18. **Multi-site management** - sites with their own domains, locales and settings from one install [D3]
- [ ] 19. **Audit log screen** - audit log filterable by user, agent, action and date [D4]
- [ ] 20. **Trash and restore** - soft delete with 30-day trash; restore keeps tree position where possible [FR-1.6]
- [ ] 21. **Custom field types** - a field package (schema, React editor, renderer) appears in the admin without core changes [A2, FR-3.2]
- [ ] 22. **Schema versions and migrations** - schema changes bump a version and run a migration function with a dry-run affected count [A3, FR-2.4]
- [ ] 23. **Localized content** (P1) - per-locale field values with fallback to the default locale [B7]

## M2 - Rendering and APIs (weeks 11-15) - Gate 2: pilot site live in production

- [ ] 24. **Website rendering** - the app serves the public site: host resolves to site, path to a published entry, rendered with the developer's layouts [C1, FR-7.1]
- [ ] 25. **Layouts, blocks and loaders** - registry maps type to layout and block to component; loaders fetch extra data; unknown blocks fail loudly in dev [C2, FR-7.2]
- [ ] 26. **Delivery API** - read-only API routes to get entries by URI or ID, list children and query by type and fields; published data only [FR-4.1]
- [ ] 27. **Scoped API tokens** - hashed tokens scoped to site and read/write, revocable, last-used shown [E3, FR-6.1]
- [ ] 28. **Codegen and typed SDK** - generated TS types and SDK cover every content type and work from React Native [E1, FR-2.3]
- [ ] 29. **create-base-app** - scaffolds the Base app with sample types and a default site, linked to a new or existing Supabase project [C1]
- [ ] 30. **Preview links** - a draft renders on the real site layout through a link that expires after 24 h [B3]
- [ ] 31. **Publish to live in 10 seconds** - cache tags per entry; publishing revalidates them in the app and purges the CDN [B4, FR-4.4]
- [ ] 32. **Content hooks** - typed hooks run sync (2 s timeout, can cancel saves) or async on the job queue with retries [C3, FR-5.2]
- [ ] 33. **Extensions** - `defineExtension()` registers types, fields, blocks, loaders, hooks, routes, settings, AI tools and migrations; installed via npm + CLI [C4, FR-5.1, FR-5.3]
- [ ] 34. **Webhooks** - HMAC-signed entry, media and schema events with exponential-backoff retries for 24 h and a delivery log [E2, FR-4.3]
- [ ] 35. **SEO and agent-readable outputs** - sitemap, robots.txt, structured data, per-page Markdown and `llms.txt` per site [FR-7.3, AI-6]
- [ ] 36. **Production readiness** - rate limits on public endpoints, Sentry, structured logs, a jobs screen, health check, Supabase backups with a tested restore [NFR]
- [ ] 37. **Scale-ready core** - one config file selects the auth, storage, jobs and API-host adapters; each adapter type has a conformance suite run in CI; a Dockerfile runs the app or `base worker` on Railway [NFR, rule 15]
- [ ] 38. **Schema sync CLI** (P1) - `cli sync schemas` exports and imports schemas and shows a diff before apply [A4]

## M3 - AI pack and v1 GA (weeks 16-21) - Gate 3: an agent's draft is approved and published

- [ ] 39. **AI provider adapter and model routing** - Sonnet for drafts, rewrites and translation, Haiku for short tasks; every AI call logged with model, template id and tokens; private fields excluded; site can switch or disable AI [G-3, G-6, G-7]
- [ ] 40. **Embeddings pipeline** - on publish, chunk and embed entry text in pgvector (Voyage) through the job queue; re-embed on change, delete on unpublish [AI-1]
- [ ] 41. **Semantic search** - natural-language search in admin and Delivery API, filtered by site and permissions [F1, AI-2]
- [ ] 42. **Draft from a brief** - AI output validated against the content type schema (retry once, never partial) and saved as a draft only [F2, AI-3, G-5]
- [ ] 43. **Field AI actions** - one-click rewrite, translate, summarize, SEO title and meta, and image alt text shown as an accept/reject diff [F3, AI-4]
- [ ] 44. **MCP server** - an MCP route whose tools mirror Admin API commands (search, get, create draft, update fields, upload media, request publish) under agent token scopes [F4, AI-5, G-2]
- [ ] 45. **Publish approvals for agents** - agent publish requests wait in an approval queue for a human with publish rights; per-site switch to allow agent publishing [F4, G-1]
- [ ] 46. **AI budget and usage** - per-site monthly token budget, usage dashboard, alert at 80% and hard stop at 100% [F5, G-4]
- [ ] 47. **Bring-your-own AI keys** - owners set the site's own Anthropic and Voyage keys, checked on save, sealed at rest, never returned or audited; AI stays off until set [Packaging rule 4, G-7]
- [ ] 48. **Personal data controls** - delete-user flow and audit-logged access to personal data [NFR Privacy]

## v1.1 - Cloud, Team pack and apps (about 8 weeks after GA) - Gate 4: first paying Cloud or Team customer

- [ ] 49. **Multi-tenant isolation** - many tenants on one install with row-level isolation proven by automated tests, per-tenant domains with automatic TLS, quotas [G2]
- [ ] 50. **Plans, checkout and license keys** - checkout, upgrades, invoices and per-domain license keys; add-ons unlock within a minute of payment [G3]
- [ ] 51. **One-command cloud deploy** - `cli deploy` provisions a Supabase project and the app (Vercel, or Railway with the optional worker) with a live URL in under 10 minutes [G1]
- [ ] 52. **Approval workflows** - configurable approval steps per site or subtree; approvers notified; publish blocked until approved [G4]
- [ ] 53. **Company SSO** (P1) - SAML via Supabase Auth, enforceable per organization [G5]
- [ ] 54. **Expo starter app** (P1) - renders blocks natively; push notification on publish [G6]
- [ ] 55. **Ask your site** (P1) - RAG answers over site content that cite source entries and respect permissions [G7]
- [ ] 56. **Content relations and bulk edit** - relations UI between entries and bulk edits in the tree
- [ ] 57. **Custom admin pages from extensions** - extensions add their own admin screens
- [ ] 58. **Blog and docs starters** - two more site starters on the same registry
- [ ] 59. **Extension registry** - publish and discover versioned extensions
- [ ] 60. **Hosted AI credits** - paid AI pack: a metered AI gateway lets production sites use included credits instead of their own keys [Packaging rule 4]

## Scale pack - for power users (after v1.1) - Gate 5: a site switches to the Scale pack by configuration alone

- [ ] 61. **Standalone API server** - a Fastify server serves the same API handlers as the app, deployable on Railway; the app calls it through `API_URL` [Scale]
- [ ] 62. **Redis job workers** - a BullMQ job adapter on Redis with long-running workers on Railway, passing the jobs conformance suite [Scale]
- [ ] 63. **Clerk auth adapter** - the Clerk adapter (from Feature 4) packaged for the Scale pack, passing the auth conformance suite, with sign-in screens [Scale]
- [ ] 64. **S3/R2 storage adapter** - Cloudflare R2 and AWS S3 behind the storage adapter, passing the storage conformance suite, with a media copy tool [Scale]
- [ ] 65. **Upgrade to the Scale pack** - `cli scale` switches an install's adapters, moves pending jobs and media, and deploys the extra services to Railway, with a dry run and a way back [Scale]

> **v2 (ecosystem), not tracked yet:** marketplace with revenue share (H1), sandboxed
> third-party code (H2), visual page builder (H3), rule-based agent publishing (H4), more
> starters and optional GraphQL (H5). Add them as numbered items when v2 starts.
