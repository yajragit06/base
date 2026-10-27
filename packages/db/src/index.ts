import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export { insertAudit, type NewAuditEntry } from "./audit.js";
export {
  createEntry,
  createEntryInTx,
  getEntry,
  getEntryByUri,
  listChildren,
  type NewEntry,
} from "./entries.js";
export { DbError, type DbErrorCode } from "./errors.js";
export { runMigrations, truncateAllTables } from "./migrations.js";
export type { AuditEntry, Domain, Entry, Site } from "./schema.js";
export { type Executor, type SiteTx, withSite } from "./site-scope.js";
export { addDomain, createSite, findSiteByHost, listSites, type NewSite } from "./sites.js";
export { schema };

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof createDb>["db"];
