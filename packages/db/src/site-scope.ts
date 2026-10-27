import { sql } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { Db } from "./index.js";
import type * as schema from "./schema.js";

export type SiteTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A database handle or an open transaction; write functions accept either. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/**
 * Runs `fn` in a transaction scoped to one site. Row-level security on tenant tables only
 * shows and accepts that site's rows; queries must still filter by `site_id` explicitly.
 */
export function withSite<T>(db: Db, siteId: string, fn: (tx: SiteTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE cms_app`);
    await tx.execute(sql`SELECT set_config('app.site_id', ${siteId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs `fn` in a transaction scoped to one user: row-level security lets it read that user's
 * own memberships across sites, and nothing else site-scoped.
 */
export function withUser<T>(db: Db, userId: string, fn: (tx: SiteTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE cms_app`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
