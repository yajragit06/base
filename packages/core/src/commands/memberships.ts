import {
  countOwnersInTx,
  DbError,
  getMembershipInTx,
  ROLES,
  schema,
  setMembershipInTx,
} from "@cms/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { defineCommand } from "../command.js";
import { CommandError } from "../errors.js";

export const grantMembershipCommand = defineCommand({
  name: "membership.grant",
  permission: "membership.grant",
  input: z.strictObject({
    siteId: z.uuid(),
    userId: z.uuid(),
    role: z.enum(ROLES),
  }),
  siteId: (input) => input.siteId,
  handler: async (tx, input, { actor }) => {
    // Serializes role changes per site, so two owners cannot demote each other at once.
    const [site] = await tx
      .select({ id: schema.sites.id })
      .from(schema.sites)
      .where(eq(schema.sites.id, input.siteId))
      .for("no key update");
    if (!site) throw new DbError("site_not_found", "Site not found.");

    const current = await getMembershipInTx(tx, input.siteId, input.userId);
    const touchesOwner = input.role === "owner" || current?.role === "owner";
    if (touchesOwner && actor.type !== "system") {
      const own = await getMembershipInTx(tx, input.siteId, actor.id);
      if (own?.role !== "owner") {
        throw new CommandError("forbidden", "Only an owner can grant or change the owner role.");
      }
    }
    if (current?.role === "owner" && input.role !== "owner") {
      if ((await countOwnersInTx(tx, input.siteId)) <= 1) {
        throw new DbError("last_owner", "A site must keep at least one owner.");
      }
    }

    const { before, after } = await setMembershipInTx(tx, input.siteId, input.userId, input.role);
    return {
      result: { siteId: input.siteId, userId: input.userId, role: after },
      audit: {
        targetType: "membership",
        targetId: input.userId,
        diff: { before: before === null ? null : { role: before }, after: { role: after } },
      },
    };
  },
});
