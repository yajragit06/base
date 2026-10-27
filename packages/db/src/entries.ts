import { and, asc, eq, isNull, max } from "drizzle-orm";
import { DbError, UNIQUE_VIOLATION, violatedConstraint } from "./errors.js";
import type { Db } from "./index.js";
import { type Entry, entries, sites } from "./schema.js";
import { type Executor, withSite } from "./site-scope.js";
import { isUuid } from "./sites.js";

// Same rules as field.slug() and content type keys in @cms/schema.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TYPE_KEY = /^[a-z][a-zA-Z0-9]*$/;
const MAX_SLUG = 200;
// Keeps uri and path well inside Postgres's btree index entry limit.
const MAX_URI_OR_PATH = 2048;

export interface NewEntry {
  parentId?: string | null;
  slug: string;
  typeKey: string;
  /** Who created the entry; Authors may later save drafts only on their own entries. */
  createdBy?: { type: "user" | "agent" | "system"; id: string };
}

function assertSiteId(siteId: string): void {
  if (!isUuid(siteId)) throw new DbError("site_not_found", "Site not found.");
}

/** Creates an entry as the last child of its parent (or of the site's top level). */
export async function createEntry(db: Db, siteId: string, input: NewEntry): Promise<Entry> {
  return withSite(db, siteId, (tx) => createEntryInTx(tx, siteId, input));
}

/**
 * The body of `createEntry` for a caller that already runs inside `withSite(siteId)`, such
 * as a command, so the entry and its audit row share one transaction.
 */
export async function createEntryInTx(
  tx: Executor,
  siteId: string,
  input: NewEntry,
): Promise<Entry> {
  assertSiteId(siteId);
  if (!SLUG.test(input.slug) || input.slug.length > MAX_SLUG) {
    throw new DbError("invalid_slug", "Use lowercase letters, digits and single hyphens.");
  }
  if (!TYPE_KEY.test(input.typeKey)) {
    throw new DbError("invalid_type_key", `"${input.typeKey}" is not a content type key.`);
  }
  const parentId = input.parentId ?? null;
  if (parentId !== null && !isUuid(parentId)) {
    throw new DbError("parent_not_found", "Parent entry not found.");
  }

  // Locking the parent (or the site, for top-level entries) serializes sibling inserts,
  // so two creates never read the same next sort order. NO KEY UPDATE still lets other
  // inserts take the KEY SHARE locks their foreign-key checks need.
  let parent: Pick<Entry, "uri" | "path"> | undefined;
  if (parentId === null) {
    const [site] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.id, siteId))
      .for("no key update");
    if (!site) throw new DbError("site_not_found", "Site not found.");
  } else {
    [parent] = await tx
      .select({ uri: entries.uri, path: entries.path })
      .from(entries)
      .where(and(eq(entries.siteId, siteId), eq(entries.id, parentId)))
      .for("no key update");
    if (!parent) throw new DbError("parent_not_found", "Parent entry not found.");
  }

  const [last] = await tx
    .select({ value: max(entries.sortOrder) })
    .from(entries)
    .where(
      and(
        eq(entries.siteId, siteId),
        parentId === null ? isNull(entries.parentId) : eq(entries.parentId, parentId),
      ),
    );
  const sortOrder = last?.value === null || last?.value === undefined ? 0 : last.value + 1;
  const id = crypto.randomUUID();
  const uri = parent ? `${parent.uri}/${input.slug}` : `/${input.slug}`;
  const path = `${parent ? parent.path : "/"}${id}/`;
  if (uri.length > MAX_URI_OR_PATH || path.length > MAX_URI_OR_PATH) {
    throw new DbError("uri_too_long", "This entry would be nested too deeply or its URI too long.");
  }

  try {
    const [entry] = await tx
      .insert(entries)
      .values({
        id,
        siteId,
        parentId,
        sortOrder,
        slug: input.slug,
        uri,
        path,
        typeKey: input.typeKey,
        createdByType: input.createdBy?.type ?? null,
        createdById: input.createdBy?.id ?? null,
      })
      .returning();
    if (!entry) throw new Error("Insert returned no entry.");
    return entry;
  } catch (error) {
    if (violatedConstraint(error, [UNIQUE_VIOLATION]) === "entries_site_uri_key") {
      throw new DbError("uri_taken", "Another entry already has this URI.");
    }
    throw error;
  }
}

export async function getEntry(db: Db, siteId: string, id: string): Promise<Entry | null> {
  assertSiteId(siteId);
  if (!isUuid(id)) return null;
  return withSite(db, siteId, async (tx) => {
    const [entry] = await tx
      .select()
      .from(entries)
      .where(and(eq(entries.siteId, siteId), eq(entries.id, id)));
    return entry ?? null;
  });
}

export async function getEntryByUri(db: Db, siteId: string, uri: string): Promise<Entry | null> {
  assertSiteId(siteId);
  return withSite(db, siteId, async (tx) => {
    const [entry] = await tx
      .select()
      .from(entries)
      .where(and(eq(entries.siteId, siteId), eq(entries.uri, uri)));
    return entry ?? null;
  });
}

/** Children of `parentId` (or the site's top-level entries for `null`) in sort order. */
export async function listChildren(
  db: Db,
  siteId: string,
  parentId: string | null,
): Promise<Entry[]> {
  assertSiteId(siteId);
  if (parentId !== null && !isUuid(parentId)) return [];
  return withSite(db, siteId, (tx) =>
    tx
      .select()
      .from(entries)
      .where(
        and(
          eq(entries.siteId, siteId),
          parentId === null ? isNull(entries.parentId) : eq(entries.parentId, parentId),
        ),
      )
      .orderBy(asc(entries.sortOrder), asc(entries.id)),
  );
}
