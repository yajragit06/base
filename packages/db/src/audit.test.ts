import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { insertAudit, type NewAuditEntry } from "./audit.js";
import type { Site } from "./schema.js";
import { withSite } from "./site-scope.js";
import { createSite } from "./sites.js";
import { useTestDb } from "./test/db.js";

const { db } = useTestDb();

let siteA: Site;
let siteB: Site;

beforeEach(async () => {
  const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };
  siteA = await createSite(db, { ...base, name: "A" });
  siteB = await createSite(db, { ...base, name: "B" });
});

function entryFor(siteId: string): NewAuditEntry {
  return {
    siteId,
    actorType: "system",
    actorId: "test",
    action: "entry.create",
    targetType: "entry",
    targetId: "e1",
    diff: { after: { slug: "a" } },
  };
}

describe("audit_log", () => {
  it("accepts a row for the transaction's own site", async () => {
    const row = await withSite(db, siteA.id, (tx) => insertAudit(tx, entryFor(siteA.id)));
    expect(row).toMatchObject({ siteId: siteA.id, actorType: "system", ai: null });
    expect(row.diff).toEqual({ after: { slug: "a" } });
  });

  it("rejects a row for another site", async () => {
    await expect(
      withSite(db, siteA.id, (tx) => insertAudit(tx, entryFor(siteB.id))),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("rejects unknown actor types and empty actor ids", async () => {
    await expect(
      withSite(db, siteA.id, (tx) =>
        insertAudit(tx, { ...entryFor(siteA.id), actorType: "robot" as "system" }),
      ),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      withSite(db, siteA.id, (tx) => insertAudit(tx, { ...entryFor(siteA.id), actorId: "" })),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("refuses UPDATE and DELETE, even for the table owner", async () => {
    await withSite(db, siteA.id, (tx) => insertAudit(tx, entryFor(siteA.id)));
    const asOwner = async (statement: ReturnType<typeof sql>) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.site_id', ${siteA.id}, true)`);
        return tx.execute(statement);
      });
    const appendOnly = { cause: { message: "audit_log is append-only" } };
    await expect(asOwner(sql`UPDATE audit_log SET action = 'x'`)).rejects.toMatchObject(appendOnly);
    await expect(asOwner(sql`DELETE FROM audit_log`)).rejects.toMatchObject(appendOnly);
    const count = await withSite(db, siteA.id, async (tx) => {
      const { rows } = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM audit_log`,
      );
      return rows[0]?.n;
    });
    expect(count).toBe(1);
  });

  it("shows a site only its own rows", async () => {
    await withSite(db, siteA.id, (tx) => insertAudit(tx, entryFor(siteA.id)));
    await withSite(db, siteB.id, (tx) => insertAudit(tx, entryFor(siteB.id)));
    const sites = await withSite(db, siteA.id, async (tx) => {
      const { rows } = await tx.execute<{ site_id: string }>(sql`SELECT site_id FROM audit_log`);
      return rows.map((r) => r.site_id);
    });
    expect(sites).toEqual([siteA.id]);
  });
});
