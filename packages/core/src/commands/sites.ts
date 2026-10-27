import { addDomain, createSite } from "@cms/db";
import { z } from "zod";
import { defineCommand } from "../command.js";

export const createSiteCommand = defineCommand({
  name: "site.create",
  permission: "site.create",
  input: z.strictObject({
    name: z.string(),
    timeZone: z.string(),
    defaultLocale: z.string(),
    locales: z.array(z.string()),
  }),
  siteId: () => undefined,
  handler: async (tx, input) => {
    const site = await createSite(tx, input);
    return {
      result: site,
      audit: { siteId: site.id, targetType: "site", targetId: site.id, diff: { after: site } },
    };
  },
});

export const addDomainCommand = defineCommand({
  name: "site.addDomain",
  permission: "site.addDomain",
  input: z.strictObject({
    siteId: z.uuid(),
    host: z.string(),
    primary: z.boolean().optional(),
  }),
  siteId: (input) => input.siteId,
  handler: async (tx, input) => {
    const domain = await addDomain(tx, input.siteId, { host: input.host, primary: input.primary });
    return {
      result: domain,
      audit: { targetType: "domain", targetId: domain.id, diff: { after: domain } },
    };
  },
});
