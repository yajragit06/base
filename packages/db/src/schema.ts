import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timeZone: text("time_zone").notNull(),
  defaultLocale: text("default_locale").notNull(),
  locales: text("locales").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    host: text("host").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [
    uniqueIndex("domains_host_key").on(t.host),
    uniqueIndex("domains_one_primary_per_site").on(t.siteId).where(sql`${t.isPrimary}`),
  ],
);

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull(),
    slug: text("slug").notNull(),
    uri: text("uri").notNull(),
    path: text("path").notNull(),
    typeKey: text("type_key").notNull(),
    // Nullable so the previous release's inserts keep working; a null creator owns nothing.
    createdByType: text("created_by_type").$type<"user" | "agent" | "system">(),
    createdById: text("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("entries_site_id_id_key").on(t.siteId, t.id),
    check("entries_created_by_type_check", sql`${t.createdByType} IN ('user', 'agent', 'system')`),
    unique("entries_site_uri_key").on(t.siteId, t.uri),
    foreignKey({
      name: "entries_parent_fkey",
      columns: [t.siteId, t.parentId],
      foreignColumns: [t.siteId, t.id],
    }).onDelete("restrict"),
    index("entries_site_parent_idx").on(t.siteId, t.parentId, t.sortOrder),
    index("entries_path_idx").on(t.path.op("text_pattern_ops")),
  ],
);

export const VERSION_STATUSES = ["draft", "published", "superseded"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** Immutable snapshots of one locale of an entry's data; a trigger rejects edits and deletes. */
export const versions = pgTable(
  "versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    locale: text("locale").notNull(),
    data: jsonb("data").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    status: text("status").$type<VersionStatus>().notNull().default("draft"),
    actorType: text("actor_type").$type<"user" | "agent" | "system">().notNull(),
    actorId: text("actor_id").notNull(),
    basedOnVersionId: uuid("based_on_version_id"),
    ai: jsonb("ai"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "versions_entry_fkey",
      columns: [t.siteId, t.entryId],
      foreignColumns: [entries.siteId, entries.id],
    }).onDelete("restrict"),
    unique("versions_site_entry_locale_id_key").on(t.siteId, t.entryId, t.locale, t.id),
    foreignKey({
      name: "versions_based_on_fkey",
      columns: [t.siteId, t.entryId, t.locale, t.basedOnVersionId],
      foreignColumns: [t.siteId, t.entryId, t.locale, t.id],
    }).onDelete("restrict"),
    // One first version per entry and locale, and at most one successor per version.
    unique("versions_chain_key").on(t.entryId, t.locale, t.basedOnVersionId).nullsNotDistinct(),
    check("versions_status_check", sql`${t.status} IN ('draft', 'published', 'superseded')`),
    check("versions_actor_type_check", sql`${t.actorType} IN ('user', 'agent', 'system')`),
    check("versions_actor_id_check", sql`${t.actorId} <> ''`),
    check("versions_schema_version_check", sql`${t.schemaVersion} > 0`),
    index("versions_history_idx").on(t.siteId, t.entryId, t.locale, t.createdAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    diff: jsonb("diff").notNull(),
    ai: jsonb("ai"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("audit_log_actor_type_check", sql`${t.actorType} IN ('user', 'agent', 'system')`),
    check("audit_log_actor_id_check", sql`${t.actorId} <> ''`),
    index("audit_log_site_created_idx").on(t.siteId, t.createdAt),
  ],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  authId: text("auth_id").notNull().unique("users_auth_id_key"),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ROLES = ["owner", "admin", "editor", "author", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const memberships = pgTable(
  "memberships",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").$type<Role>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "memberships_pkey", columns: [t.siteId, t.userId] }),
    check(
      "memberships_role_check",
      sql`${t.role} IN ('owner', 'admin', 'editor', 'author', 'viewer')`,
    ),
    index("memberships_user_idx").on(t.userId),
  ],
);

export type Site = typeof sites.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
