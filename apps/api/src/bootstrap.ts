import {
  type Actor,
  createSiteCommand,
  grantMembershipCommand,
  roleAuthorizer,
  runCommand,
} from "@cms/core";
import { type Db, findUsersByEmail, type Site } from "@cms/db";

export interface NewSiteWithOwner {
  name: string;
  timeZone: string;
  locale: string;
  ownerEmail: string;
}

const actor: Actor = { type: "system", id: "create-site" };

/**
 * Creates a site and makes an existing user its first Owner. Only system actors may create
 * sites; the owner must have signed in once so their user record exists.
 */
export async function createSiteWithOwner(db: Db, input: NewSiteWithOwner): Promise<Site> {
  // Look the owner up first, so a bad email never leaves a site without an owner.
  const owners = await findUsersByEmail(db, input.ownerEmail);
  if (owners.length === 0) {
    throw new Error(`No user has the email ${input.ownerEmail}. They must sign in once first.`);
  }
  if (owners.length > 1) {
    throw new Error(`More than one user has the email ${input.ownerEmail}; resolve that first.`);
  }
  const [owner] = owners;
  if (!owner) throw new Error("unreachable");

  const deps = { db, authorize: roleAuthorizer(db) };
  const site = await runCommand(deps, createSiteCommand, actor, {
    name: input.name,
    timeZone: input.timeZone,
    defaultLocale: input.locale,
    locales: [input.locale],
  });
  await runCommand(deps, grantMembershipCommand, actor, {
    siteId: site.id,
    userId: owner.id,
    role: "owner",
  });
  return site;
}
