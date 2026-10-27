import { type Db, getMembership, type Role } from "@cms/db";
import type { Authorizer } from "./authorize.js";

/**
 * Which roles hold each site permission (project-plan.md section 2). A permission missing
 * here is denied to every user. `site.create` is install-level: only system actors run it.
 */
export const PERMISSIONS: Readonly<Record<string, readonly Role[]>> = {
  "entry.create": ["owner", "admin", "editor", "author"],
  "entry.saveDraft": ["owner", "admin", "editor", "author"],
  "site.addDomain": ["owner", "admin"],
  "membership.grant": ["owner", "admin"],
};

/**
 * Allows system actors, denies agents (until API tokens exist), and allows a user only when
 * their role on the command's site holds the permission.
 */
export function roleAuthorizer(db: Db): Authorizer {
  return async (actor, permission, { siteId }) => {
    if (actor.type === "system") return true;
    if (actor.type !== "user" || siteId === undefined) return false;
    const roles = PERMISSIONS[permission];
    if (!roles) return false;
    const membership = await getMembership(db, siteId, actor.id);
    return membership !== null && roles.includes(membership.role);
  };
}
