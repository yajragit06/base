import { findOrCreateUser, getMembership, schema, withSite } from "@cms/db";
import { describe, expect, it } from "vitest";
import { createSiteWithOwner } from "./bootstrap.js";
import { useTestDb } from "./test/db.js";

const { db } = useTestDb();
const input = {
  name: "Acme",
  timeZone: "Asia/Brunei",
  locale: "en",
  ownerEmail: "Ada@Example.com",
};

describe("createSiteWithOwner", () => {
  it("creates the site and makes the user its owner, with two audit rows", async () => {
    const ada = await findOrCreateUser(db, {
      authId: "user_ada",
      email: "ada@example.com",
      name: "Ada",
    });
    const site = await createSiteWithOwner(db, input);
    expect(site).toMatchObject({ name: "Acme", timeZone: "Asia/Brunei", locales: ["en"] });
    expect((await getMembership(db, site.id, ada.id))?.role).toBe("owner");
    const audit = await withSite(db, site.id, (tx) => tx.select().from(schema.auditLog));
    expect(audit.map((a) => [a.actorType, a.actorId, a.action]).sort()).toEqual([
      ["system", "create-site", "membership.grant"],
      ["system", "create-site", "site.create"],
    ]);
  });

  it("fails before creating anything when the email matches no user or several", async () => {
    await expect(createSiteWithOwner(db, input)).rejects.toThrow("must sign in once first");
    await findOrCreateUser(db, { authId: "a1", email: "ada@example.com", name: null });
    await findOrCreateUser(db, { authId: "a2", email: "ada@example.com", name: null });
    await expect(createSiteWithOwner(db, input)).rejects.toThrow("More than one user");
    expect(await db.select().from(schema.sites)).toEqual([]);
  });
});
