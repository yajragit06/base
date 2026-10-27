import { createEntryInTx } from "@cms/db";
import { z } from "zod";
import { defineCommand } from "../command.js";

export const createEntryCommand = defineCommand({
  name: "entry.create",
  permission: "entry.create",
  input: z.strictObject({
    siteId: z.uuid(),
    parentId: z.uuid().nullable().optional(),
    slug: z.string(),
    typeKey: z.string(),
  }),
  siteId: (input) => input.siteId,
  handler: async (tx, input, { actor }) => {
    const entry = await createEntryInTx(tx, input.siteId, {
      parentId: input.parentId,
      slug: input.slug,
      typeKey: input.typeKey,
      createdBy: { type: actor.type, id: actor.id },
    });
    return {
      result: entry,
      audit: { targetType: "entry", targetId: entry.id, diff: { after: entry } },
    };
  },
});
