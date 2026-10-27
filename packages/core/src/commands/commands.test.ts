import { type AuditEntry, createSite, schema, withSite } from "@cms/db";
import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type Actor, allowAll } from "../authorize.js";
import { runCommand } from "../command.js";
import { CommandError } from "../errors.js";
import { useTestDb } from "../test/db.js";
import { createEntryCommand } from "./entries.js";
import { addDomainCommand, createSiteCommand } from "./sites.js";

const { db } = useTestDb();
const deps = { db, authorize: allowAll };
const editor: Actor = { type: "user", id: "user_1" };
const agent: Actor = { type: "agent", id: "token_9" };
const siteInput = { name: "Acme", timeZone: "Asia/Brunei", defaultLocale: "en", locales: ["en"] };

function auditOf(siteId: string): Promise<AuditEntry[]> {
  return withSite(db, siteId, (tx) =>
    tx.select().from(schema.auditLog).orderBy(asc(schema.auditLog.createdAt)),
  );
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandError) return error.code;
    throw error;
  }
  return "ok";
}

describe("site.create", () => {
  it("creates the site and audits it under the new site", async () => {
    const site = await runCommand(deps, createSiteCommand, editor, siteInput);
    const [audit, ...rest] = await auditOf(site.id);
    expect(rest).toEqual([]);
    expect(audit).toMatchObject({
      siteId: site.id,
      actorType: "user",
      actorId: "user_1",
      action: "site.create",
      targetType: "site",
      targetId: site.id,
      ai: null,
    });
    expect(audit?.diff).toMatchObject({ after: { id: site.id, name: "Acme" } });
  });

  it("passes database error codes through and writes nothing", async () => {
    expect(
      await codeOf(
        runCommand(deps, createSiteCommand, editor, { ...siteInput, timeZone: "+01:00" }),
      ),
    ).toBe("invalid_time_zone");
    expect(await db.select().from(schema.sites)).toEqual([]);
  });
});

describe("site.addDomain", () => {
  it("adds the domain and audits it", async () => {
    const site = await createSite(db, siteInput);
    const domain = await runCommand(deps, addDomainCommand, editor, {
      siteId: site.id,
      host: "Acme.com",
      primary: true,
    });
    expect(domain.host).toBe("acme.com");
    const [audit] = await auditOf(site.id);
    expect(audit).toMatchObject({
      action: "site.addDomain",
      targetType: "domain",
      targetId: domain.id,
    });
  });

  it("reports host_taken with no audit row", async () => {
    const a = await createSite(db, siteInput);
    const b = await createSite(db, { ...siteInput, name: "Other" });
    await runCommand(deps, addDomainCommand, editor, { siteId: a.id, host: "acme.com" });
    expect(
      await codeOf(runCommand(deps, addDomainCommand, editor, { siteId: b.id, host: "acme.com" })),
    ).toBe("host_taken");
    expect(await auditOf(b.id)).toEqual([]);
  });
});

describe("entry.create", () => {
  it("creates the entry and records the agent as the actor", async () => {
    const site = await createSite(db, siteInput);
    const entry = await runCommand(deps, createEntryCommand, agent, {
      siteId: site.id,
      slug: "about",
      typeKey: "page",
    });
    expect(entry.uri).toBe("/about");
    const [audit] = await auditOf(site.id);
    expect(audit).toMatchObject({
      actorType: "agent",
      actorId: "token_9",
      action: "entry.create",
      targetType: "entry",
      targetId: entry.id,
    });
    expect(audit?.diff).toMatchObject({ after: { id: entry.id, uri: "/about" } });
  });

  it("refuses another site's parent and writes no audit row", async () => {
    const a = await createSite(db, siteInput);
    const b = await createSite(db, { ...siteInput, name: "Other" });
    const parent = await runCommand(deps, createEntryCommand, editor, {
      siteId: b.id,
      slug: "b",
      typeKey: "page",
    });
    expect(
      await codeOf(
        runCommand(deps, createEntryCommand, editor, {
          siteId: a.id,
          parentId: parent.id,
          slug: "x",
          typeKey: "page",
        }),
      ),
    ).toBe("parent_not_found");
    expect(await auditOf(a.id)).toEqual([]);
    expect(await auditOf(b.id)).toHaveLength(1);
  });

  it("reports uri_taken and rolls back", async () => {
    const site = await createSite(db, siteInput);
    const input = { siteId: site.id, slug: "about", typeKey: "page" };
    await runCommand(deps, createEntryCommand, editor, input);
    expect(await codeOf(runCommand(deps, createEntryCommand, editor, input))).toBe("uri_taken");
    expect(await auditOf(site.id)).toHaveLength(1);
  });
});
