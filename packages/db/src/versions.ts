import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DbError, FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION, violatedConstraint } from "./errors.js";
import type { Db } from "./index.js";
import { type Version, versions } from "./schema.js";
import { type Executor, withSite } from "./site-scope.js";
import { isUuid } from "./sites.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface NewVersion {
  entryId: string;
  locale: string;
  data: unknown;
  schemaVersion: number;
  actorType: "user" | "agent" | "system";
  actorId: string;
  basedOnVersionId: string | null;
}

/**
 * Appends a draft to the entry's chain for its locale, for a caller already inside
 * `withSite(siteId)`. The chain constraint refuses a second successor of the same version
 * (or a second first version), so concurrent saves on one base yield one version.
 */
export async function appendVersionInTx(
  tx: Executor,
  siteId: string,
  input: NewVersion,
): Promise<Version> {
  try {
    const [version] = await tx
      .insert(versions)
      .values({
        siteId,
        entryId: input.entryId,
        locale: input.locale,
        data: input.data,
        schemaVersion: input.schemaVersion,
        actorType: input.actorType,
        actorId: input.actorId,
        basedOnVersionId: input.basedOnVersionId,
      })
      .returning();
    if (!version) throw new Error("Insert returned no version.");
    return version;
  } catch (error) {
    const constraint = violatedConstraint(error, [UNIQUE_VIOLATION, FOREIGN_KEY_VIOLATION]);
    if (constraint === "versions_chain_key") {
      throw new DbError("version_conflict", "Someone saved a newer version first.");
    }
    if (constraint === "versions_based_on_fkey") {
      throw new DbError(
        "version_not_found",
        "The base version is not a version of this entry and locale.",
      );
    }
    if (constraint === "versions_entry_fkey") {
      throw new DbError("entry_not_found", "Entry not found.");
    }
    throw error;
  }
}

export async function getVersion(db: Db, siteId: string, id: string): Promise<Version | null> {
  if (!isUuid(siteId) || !isUuid(id)) return null;
  return withSite(db, siteId, async (tx) => {
    const [version] = await tx
      .select()
      .from(versions)
      .where(and(eq(versions.siteId, siteId), eq(versions.id, id)));
    return version ?? null;
  });
}

/**
 * The query behind `getLatestVersionInTx`, exported for its query-plan test. The successor
 * check names the entry and locale so it can use `versions_chain_key` instead of scanning
 * every version in the site.
 */
export function latestVersionQuery(tx: Executor, siteId: string, entryId: string, locale: string) {
  const next = alias(versions, "next");
  return tx
    .select()
    .from(versions)
    .where(
      and(
        eq(versions.siteId, siteId),
        eq(versions.entryId, entryId),
        eq(versions.locale, locale),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(next)
            .where(
              and(
                eq(next.siteId, siteId),
                eq(next.entryId, entryId),
                eq(next.locale, locale),
                eq(next.basedOnVersionId, versions.id),
              ),
            ),
        ),
      ),
    );
}

/** The newest version of one locale of an entry: the one nothing is based on. */
export async function getLatestVersionInTx(
  tx: Executor,
  siteId: string,
  entryId: string,
  locale: string,
): Promise<Version | null> {
  if (!isUuid(siteId) || !isUuid(entryId)) return null;
  const [version] = await latestVersionQuery(tx, siteId, entryId, locale);
  return version ?? null;
}

export function getLatestVersion(
  db: Db,
  siteId: string,
  entryId: string,
  locale: string,
): Promise<Version | null> {
  if (!isUuid(siteId)) return Promise.resolve(null);
  return withSite(db, siteId, (tx) => getLatestVersionInTx(tx, siteId, entryId, locale));
}

/** An entry's versions, newest first, optionally for one locale. */
export async function listVersions(
  db: Db,
  siteId: string,
  entryId: string,
  options: { locale?: string; limit?: number } = {},
): Promise<Version[]> {
  if (!isUuid(siteId) || !isUuid(entryId)) return [];
  const requested = Number.isFinite(options.limit) ? Math.trunc(options.limit ?? 0) : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(requested, 1), MAX_LIMIT);
  return withSite(db, siteId, (tx) =>
    tx
      .select()
      .from(versions)
      .where(
        and(
          eq(versions.siteId, siteId),
          eq(versions.entryId, entryId),
          options.locale === undefined ? undefined : eq(versions.locale, options.locale),
        ),
      )
      .orderBy(desc(versions.createdAt), desc(versions.id))
      .limit(limit),
  );
}
