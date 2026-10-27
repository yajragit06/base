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
export type { AuditEntry, Domain, Entry, Membership, Site, User, Version } from "./schema.js";
export { ROLES, type Role, VERSION_STATUSES, type VersionStatus } from "./schema.js";
export { type Executor, type SiteTx, withSite, withUser } from "./site-scope.js";
export { addDomain, createSite, findSiteByHost, listSites, type NewSite } from "./sites.js";
export {
  countOwnersInTx,
  findOrCreateUser,
  findUserByAuthId,
  findUsersByEmail,
  getMembership,
  getMembershipInTx,
  type Identity,
  listMembershipsForUser,
  setMembershipInTx,
  type UserMembership,
} from "./users.js";
export {
  appendVersionInTx,
  getLatestVersion,
  getLatestVersionInTx,
  getVersion,
  listVersions,
  type NewVersion,
} from "./versions.js";
export { schema };

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

export type Db = ReturnType<typeof createDb>["db"];
