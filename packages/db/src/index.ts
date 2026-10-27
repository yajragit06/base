import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export { createEntry, getEntry, getEntryByUri, listChildren, type NewEntry } from "./entries.js";
export { DbError, type DbErrorCode } from "./errors.js";
export type { Domain, Entry, Site } from "./schema.js";
export { type SiteTx, withSite } from "./site-scope.js";
export { addDomain, createSite, findSiteByHost, listSites, type NewSite } from "./sites.js";
export { schema };

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof createDb>["db"];
