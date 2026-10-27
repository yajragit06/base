import { and, asc, eq, sql } from "drizzle-orm";
import { DbError, FOREIGN_KEY_VIOLATION, violatedConstraint } from "./errors.js";
import type { Db } from "./index.js";
import { type Membership, memberships, type Role, sites, type User, users } from "./schema.js";
import { type Executor, withSite, withUser } from "./site-scope.js";
import { isUuid } from "./sites.js";

export interface Identity {
  authId: string;
  email: string;
  name: string | null;
}

/**
 * The user for an identity-provider subject, created on first sight. Concurrent first
 * requests create one row; the stored email and name follow the provider.
 */
export async function findOrCreateUser(db: Executor, identity: Identity): Promise<User> {
  const values = {
    authId: identity.authId,
    email: identity.email.toLowerCase(),
    name: identity.name,
  };
  const [user] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({ target: users.authId, set: { email: values.email, name: values.name } })
    .returning();
  if (!user) throw new Error("Upsert returned no user.");
  return user;
}

export async function findUserByAuthId(db: Executor, authId: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.authId, authId));
  return user ?? null;
}

export function findUsersByEmail(db: Executor, email: string): Promise<User[]> {
  return db.select().from(users).where(eq(users.email, email.toLowerCase()));
}

/** The user's role on a site, read inside a transaction already scoped to that site. */
export async function getMembershipInTx(
  tx: Executor,
  siteId: string,
  userId: string,
): Promise<Membership | null> {
  if (!isUuid(siteId) || !isUuid(userId)) return null;
  const [membership] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.siteId, siteId), eq(memberships.userId, userId)));
  return membership ?? null;
}

export function getMembership(db: Db, siteId: string, userId: string): Promise<Membership | null> {
  if (!isUuid(siteId) || !isUuid(userId)) return Promise.resolve(null);
  return withSite(db, siteId, (tx) => getMembershipInTx(tx, siteId, userId));
}

export interface UserMembership {
  siteId: string;
  siteName: string;
  role: Role;
}

/** Every site the user belongs to, by site name. Row-level security limits it to this user. */
export function listMembershipsForUser(db: Db, userId: string): Promise<UserMembership[]> {
  if (!isUuid(userId)) return Promise.resolve([]);
  return withUser(db, userId, (tx) =>
    tx
      .select({ siteId: memberships.siteId, siteName: sites.name, role: memberships.role })
      .from(memberships)
      .innerJoin(sites, eq(memberships.siteId, sites.id))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(sites.name), asc(sites.id)),
  );
}

/** Number of owners on a site, read inside a transaction scoped to that site. */
export async function countOwnersInTx(tx: Executor, siteId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.siteId, siteId), eq(memberships.role, "owner")));
  return row?.n ?? 0;
}

/** Sets a user's role on a site (inside a transaction scoped to it) and returns both roles. */
export async function setMembershipInTx(
  tx: Executor,
  siteId: string,
  userId: string,
  role: Role,
): Promise<{ before: Role | null; after: Role }> {
  if (!isUuid(userId)) throw new DbError("user_not_found", "User not found.");
  const before = await getMembershipInTx(tx, siteId, userId);
  try {
    await tx
      .insert(memberships)
      .values({ siteId, userId, role })
      .onConflictDoUpdate({
        target: [memberships.siteId, memberships.userId],
        set: { role, updatedAt: sql`now()` },
      });
  } catch (error) {
    const constraint = violatedConstraint(error, [FOREIGN_KEY_VIOLATION]);
    if (constraint === "memberships_user_id_users_id_fk") {
      throw new DbError("user_not_found", "User not found.");
    }
    if (constraint === "memberships_site_id_sites_id_fk") {
      throw new DbError("site_not_found", "Site not found.");
    }
    throw error;
  }
  return { before: before?.role ?? null, after: role };
}
