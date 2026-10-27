import { createEntryInTx, createSite, type Executor, withSite } from "@cms/db";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type Actor, allowAll, denyAll } from "./authorize.js";
import { defineCommand, runCommand } from "./command.js";
import { CommandError } from "./errors.js";
import { useTestDb } from "./test/db.js";

const { db } = useTestDb();
const actor: Actor = { type: "user", id: "user_1" };
const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };

async function errorOf(promise: Promise<unknown>): Promise<CommandError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandError) return error;
    throw error;
  }
  throw new Error("expected the command to fail");
}

function auditCount(siteId: string): Promise<number | undefined> {
  return withSite(db, siteId, async (tx) => {
    const { rows } = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_log`);
    return rows[0]?.n;
  });
}

function entryCount(siteId: string): Promise<number | undefined> {
  return withSite(db, siteId, async (tx) => {
    const { rows } = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM entries`);
    return rows[0]?.n;
  });
}

const echo = (handler = vi.fn()) =>
  defineCommand({
    name: "test.echo",
    permission: "test.echo",
    input: z.strictObject({ siteId: z.uuid(), title: z.string().min(1) }),
    siteId: (input) => input.siteId,
    handler: async (tx: Executor, input) => {
      handler(input);
      return {
        result: input,
        audit: { targetType: "test", targetId: "t", diff: { after: input } },
      };
    },
  });

describe("runCommand", () => {
  it("rejects invalid input with field errors and never calls the handler", async () => {
    const handler = vi.fn();
    const error = await errorOf(
      runCommand({ db, authorize: allowAll }, echo(handler), actor, { siteId: "x", extra: 1 }),
    );
    expect(error.code).toBe("invalid_input");
    expect(error.fieldErrors.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: ["siteId"], code: "invalid_format" },
      { path: ["title"], code: "required" },
      { path: ["extra"], code: "unknown_field" },
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("asks the authorizer with the permission and site, and stops when it denies", async () => {
    const site = await createSite(db, { ...base, name: "A" });
    const handler = vi.fn();
    const authorize = vi.fn(() => false);
    const error = await errorOf(
      runCommand({ db, authorize }, echo(handler), actor, { siteId: site.id, title: "Hi" }),
    );
    expect(error.code).toBe("forbidden");
    expect(authorize).toHaveBeenCalledWith(actor, "test.echo", { siteId: site.id });
    expect(handler).not.toHaveBeenCalled();
    expect(await auditCount(site.id)).toBe(0);
  });

  it("denies everything with the default authorizer", async () => {
    const site = await createSite(db, { ...base, name: "A" });
    const error = await errorOf(
      runCommand({ db, authorize: denyAll }, echo(), actor, { siteId: site.id, title: "Hi" }),
    );
    expect(error.code).toBe("forbidden");
  });

  it("commits the change and its audit row together", async () => {
    const site = await createSite(db, { ...base, name: "A" });
    const result = await runCommand({ db, authorize: allowAll }, echo(), actor, {
      siteId: site.id,
      title: "Hi",
    });
    expect(result).toEqual({ siteId: site.id, title: "Hi" });
    expect(await auditCount(site.id)).toBe(1);
  });

  it("rolls back the change and the audit row when the handler fails after writing", async () => {
    const site = await createSite(db, { ...base, name: "A" });
    const failing = defineCommand({
      name: "test.fail",
      permission: "test.fail",
      input: z.strictObject({ siteId: z.uuid() }),
      siteId: (input) => input.siteId,
      handler: async (tx) => {
        await createEntryInTx(tx, site.id, { slug: "written", typeKey: "page" });
        throw new Error("boom after the write");
      },
    });
    await expect(
      runCommand({ db, authorize: allowAll }, failing, actor, { siteId: site.id }),
    ).rejects.toThrow("boom after the write");
    expect(await entryCount(site.id)).toBe(0);
    expect(await auditCount(site.id)).toBe(0);
  });

  it("rolls back the change when the audit row cannot be written", async () => {
    const site = await createSite(db, { ...base, name: "A" });
    const noSite = defineCommand({
      name: "test.noSite",
      permission: "test.noSite",
      input: z.strictObject({}),
      siteId: () => undefined,
      handler: async (tx) => {
        await tx.execute(sql`UPDATE sites SET name = 'changed' WHERE id = ${site.id}`);
        return { result: null, audit: { targetType: "site", targetId: site.id, diff: {} } };
      },
    });
    await expect(runCommand({ db, authorize: allowAll }, noSite, actor, {})).rejects.toThrow(
      "returned no site for its audit row",
    );
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT name FROM sites WHERE id = ${site.id}`,
    );
    expect(rows[0]?.name).toBe("A");
  });

  it("refuses an empty actor id", async () => {
    await expect(
      runCommand({ db, authorize: allowAll }, echo(), { type: "system", id: "" }, {}),
    ).rejects.toThrow("needs an actor id");
  });
});
