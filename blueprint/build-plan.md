# Build Plan

Features in build order, grouped by milestone. Each item is one feature-sized outcome;
`/feature` writes the detailed spec. PRD story and requirement IDs are in brackets so
specs, tests and tickets can cite them. Items marked (P1) move to v1.1 if the schedule
slips. Do not renumber completed features; their archived specs refer to these IDs.

Scaffolding the monorepo (pnpm + Turborepo, Docker Postgres/Redis, lint, test runner, CI)
is a pre-build step done before Feature 1, not a feature.

## M0 - Foundations (weeks 1-3)

- [x] 1. **Content type definitions** - `defineContentType()` with Zod fields and the built-in field types produces TS types and API validation with field-level errors [A1, FR-2.1, FR-2.2]
- [x] 2. **Sites and the content tree** - sites with domains and locales; entries stored as a per-site tree with parent, sort order, slug and computed URI [FR-1.1]
- [x] 3. **Typed commands and audit log** - every write is a Zod-validated command with a permission check and an audit entry (user, agent or system) in the same transaction [FR-4.2, FR-6.3]
- [ ] 4. **Sign-in and roles** - Clerk sign-in behind an auth adapter; Owner, Admin, Editor, Author, Viewer per site, enforced in the core [FR-6.1, FR-6.2]
- [ ] 5. **Drafts and immutable versions** - field data stored per version and locale; saving creates a draft that never touches published content [FR-1.2, FR-1.3]

## M1 - Editing core (weeks 4-10) - Gate 1: pilot site modeled and edited in staging

- [ ] 6. **Admin shell and tree** - admin app with site switcher and a lazily loaded tree that stays fast at 5,000 nodes [B1, FR-3.1]
- [ ] 7. **Schema-driven entry editor** - forms rendered from content types with 10 s autosave of drafts [B2, FR-3.2, FR-3.5]
- [ ] 8. **Move, reorder and redirects** - drag-and-drop in the tree rebuilds descendant URIs and writes 301 redirects [B1, FR-1.4]
- [ ] 9. **Publish and version history** - publish or unpublish now; history shows author, time and AI/human actor with diff; restore creates a new draft [B4, B5, FR-3.3]
- [ ] 10. **Scheduled publishing** - publish and unpublish at a set time in the site time zone via BullMQ, accurate to the minute [B4, FR-1.5]
- [ ] 11. **Media library** - drag-drop upload through the storage adapter (R2), resize and crops, alt text required before publish [B6]
- [ ] 12. **Users and invitations** - admins invite users by email (Resend) and assign roles [D1]
- [ ] 13. **Subtree policies** - grants on a tree node apply to descendants; denied actions are hidden and blocked by the API [D2]
- [ ] 14. **Multi-site management** - sites with their own domains, locales and settings from one install [D3]
- [ ] 15. **Audit log screen** - audit log filterable by user, agent, action and date [D4]
- [ ] 16. **Trash and restore** - soft delete with 30-day trash; restore keeps tree position where possible [FR-1.6]
- [ ] 17. **Custom field types** - a field package (schema, React editor, renderer) appears in the admin without core changes [A2, FR-3.2]
- [ ] 18. **Schema versions and migrations** - schema changes bump a version and run a migration function with a dry-run affected count [A3, FR-2.4]
- [ ] 19. **Localized content** (P1) - per-locale field values with fallback to the default locale [B7]

## M2 - Rendering and APIs (weeks 11-15) - Gate 2: pilot site live in production

- [ ] 20. **Delivery API** - read-only API to get entries by URI or ID, list children and query by type and fields; published data only [FR-4.1]
- [ ] 21. **Scoped API tokens** - hashed tokens scoped to site and read/write, revocable, last-used shown [E3, FR-6.1]
- [ ] 22. **Codegen and typed SDK** - generated TS types and SDK cover every content type and work from React Native [E1, FR-2.3]
- [ ] 23. **Site starter and create-app** - `create-base-app` scaffolds a Next.js site that resolves host to site and path to entry [C1, FR-7.1]
- [ ] 24. **Layouts, blocks and loaders** - registry maps type to layout and block to component; loaders fetch extra data; unknown blocks fail loudly in dev [C2, FR-7.2]
- [ ] 25. **Preview links** - a draft renders on the real site layout through a link that expires after 24 h [B3]
- [ ] 26. **Publish to live in 10 seconds** - cache tags per entry; publishing purges Next.js and CDN caches [B4, FR-4.4]
- [ ] 27. **Content hooks** - typed hooks run sync (2 s timeout, can cancel saves) or async on BullMQ with retries [C3, FR-5.2]
- [ ] 28. **Extensions** - `defineExtension()` registers types, fields, blocks, loaders, hooks, routes, settings, AI tools and migrations; installed via npm + CLI [C4, FR-5.1, FR-5.3]
- [ ] 29. **Webhooks** - HMAC-signed entry, media and schema events with exponential-backoff retries for 24 h and a delivery log [E2, FR-4.3]
- [ ] 30. **SEO and agent-readable outputs** - sitemap, robots.txt, structured data, per-page Markdown and `llms.txt` per site [FR-7.3, AI-6]
- [ ] 31. **Production readiness** - rate limits on public endpoints, Sentry, structured logs, queue dashboard, health check, Docker image, daily backups with a tested restore [NFR]
- [ ] 32. **Schema sync CLI** (P1) - `cli sync schemas` exports and imports schemas and shows a diff before apply [A4]

## M3 - AI pack and v1 GA (weeks 16-21) - Gate 3: an agent's draft is approved and published

- [ ] 33. **AI provider adapter and model routing** - Sonnet for drafts, rewrites and translation, Haiku for short tasks; every AI call logged with model, template id and tokens; private fields excluded; site can switch or disable AI [G-3, G-6, G-7]
- [ ] 34. **Embeddings pipeline** - on publish, chunk and embed entry text in pgvector (Voyage); re-embed on change, delete on unpublish [AI-1]
- [ ] 35. **Semantic search** - natural-language search in admin and Delivery API, filtered by site and permissions [F1, AI-2]
- [ ] 36. **Draft from a brief** - AI output validated against the content type schema (retry once, never partial) and saved as a draft only [F2, AI-3, G-5]
- [ ] 37. **Field AI actions** - one-click rewrite, translate, summarize, SEO title and meta, and image alt text shown as an accept/reject diff [F3, AI-4]
- [ ] 38. **MCP server** - MCP tools mirror Admin API commands (search, get, create draft, update fields, upload media, request publish) under agent token scopes [F4, AI-5, G-2]
- [ ] 39. **Publish approvals for agents** - agent publish requests wait in an approval queue for a human with publish rights; per-site switch to allow agent publishing [F4, G-1]
- [ ] 40. **AI budget and usage** - per-site monthly token budget, usage dashboard, alert at 80% and hard stop at 100% [F5, G-4]
- [ ] 41. **Bring-your-own AI keys** - owners set the site's own Anthropic and Voyage keys, checked on save, sealed at rest, never returned or audited; AI stays off until set [Packaging rule 4, G-7]
- [ ] 42. **Personal data controls** - delete-user flow and audit-logged access to personal data [NFR Privacy]

## v1.1 - Cloud, Team pack and apps (about 8 weeks after GA) - Gate 4: first paying Cloud or Team customer

- [ ] 43. **Multi-tenant isolation** - many tenants on one install with row-level isolation proven by automated tests, per-tenant domains with automatic TLS, quotas [G2]
- [ ] 44. **Plans, checkout and license keys** - checkout, upgrades, invoices and per-domain license keys; add-ons unlock within a minute of payment [G3]
- [ ] 45. **One-command cloud deploy** - `cli deploy` provisions API, workers, Postgres, Redis and storage with a live URL in under 10 minutes [G1]
- [ ] 46. **Approval workflows** - configurable approval steps per site or subtree; approvers notified; publish blocked until approved [G4]
- [ ] 47. **Company SSO** (P1) - SAML/OIDC via Clerk, enforceable per organization [G5]
- [ ] 48. **Expo starter app** (P1) - renders blocks natively; push notification on publish [G6]
- [ ] 49. **Ask your site** (P1) - RAG answers over site content that cite source entries and respect permissions [G7]
- [ ] 50. **Content relations and bulk edit** - relations UI between entries and bulk edits in the tree
- [ ] 51. **Custom admin pages from extensions** - extensions add their own admin screens
- [ ] 52. **Blog and docs starters** - two more site starters on the same registry
- [ ] 53. **Extension registry** - publish and discover versioned extensions
- [ ] 54. **Hosted AI credits** - paid AI pack: a metered AI gateway lets production sites use included credits instead of their own keys [Packaging rule 4]

> **v2 (ecosystem), not tracked yet:** marketplace with revenue share (H1), sandboxed
> third-party code (H2), visual page builder (H3), rule-based agent publishing (H4), more
> starters and optional GraphQL (H5). Add them as numbered items when v2 starts.
