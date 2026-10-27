import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("entries_site_id_id_key").on(t.siteId, t.id),
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

export type Site = typeof sites.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
