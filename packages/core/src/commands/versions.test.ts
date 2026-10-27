import {
  type AuditEntry,
  createEntry,
  createSite,
  findOrCreateUser,
  type Role,
  schema,
  setMembershipInTx,
  withSite,
} from "@cms/db";
import { defineContentType, field } from "@cms/schema";
import { asc, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor, Authorizer } from "../authorize.js";
import { runCommand } from "../command.js";
import { CommandError } from "../errors.js";
import { roleAuthorizer } from "../permissions.js";
import { useTestDb } from "../test/db.js";
import { createEntryCommand } from "./entries.js";
import { saveDraftCommand } from "./versions.js";

const { db } = useTestDb();
const page = defineContentType({
  key: "page",
  fields: { title: field.text({ required: true }) },
});
const deps = { db, authorize: roleAuthorizer(db), contentTypes: [page] };
const system: Actor = { type: "system", id: "seed" };

let siteA: string;
let siteB: string;

beforeEach(async () => {
  const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en", "fr"] };
  siteA = (await createSite(db, { ...base, name: "A" })).id;
  siteB = (await createSite(db, { ...base, name: "B" })).id;
});

async function member(role: Role, siteId = siteA): Promise<Actor> {
  const user = await findOrCreateUser(db, {
    authId: `auth_${role}_${siteId}_${Math.random()}`,
    email: `${role}@x.com`,
    name: null,
  });
  await withSite(db, siteId, (tx) => setMembershipInTx(tx, siteId, user.id, role));
  return { type: "user", id: user.id };
}

async function entryBy(actor: Actor, typeKey = "page", siteId = siteA) {
  return runCommand(deps, createEntryCommand, actor, {
    siteId,
    slug: `e${Math.floor(Math.random() * 1e9)}`,
    typeKey,
  });
}

function save(actor: Actor, input: Record<string, unknown>) {
  return runCommand(deps, saveDraftCommand, actor, {
    siteId: siteA,
    locale: "en",
    baseVersionId: null,
    data: { title: "Hello" },
    ...input,
  });
}

async function errorOf(promise: Promise<unknown>): Promise<CommandError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandError) return error;
    throw error;
  }
  throw new Error("expected the command to fail");
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

function saveAudits(siteId = siteA): Promise<AuditEntry[]> {
  return withSite(db, siteId, (tx) =>
    tx
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.action} = 'entry.saveDraft'`)
      .orderBy(asc(schema.auditLog.createdAt)),
  );
}

function versionCount(siteId = siteA): Promise<number | undefined> {
  return withSite(db, siteId, async (tx) => {
    const { rows } = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM versions`);
    return rows[0]?.n;
  });
}

describe("entry.create", () => {
  it("records the acting user as creator", async () => {
    const author = await member("author");
    const entry = await entryBy(author);
    expect(entry).toMatchObject({ createdByType: "user", createdById: author.id });
  });
});

describe("entry.saveDraft", () => {
  it("saves a draft chain and audits each save once", async () => {
    const editor = await member("editor");
    const entry = await entryBy(editor);
    const v1 = await save(editor, { entryId: entry.id, data: { title: " Hello " } });
    expect(v1).toMatchObject({
      siteId: siteA,
      entryId: entry.id,
      locale: "en",
      status: "draft",
      schemaVersion: 1,
      actorType: "user",
      actorId: editor.id,
      basedOnVersionId: null,
      ai: null,
    });
    const v2 = await save(editor, {
      entryId: entry.id,
      baseVersionId: v1.id,
      data: { title: "Two" },
    });
    expect(v2.basedOnVersionId).toBe(v1.id);
    expect(v2.data).toEqual({ title: "Two" });

    const [first, second, ...rest] = await saveAudits();
    expect(rest).toEqual([]);
    expect(first).toMatchObject({
      actorType: "user",
      actorId: editor.id,
      targetType: "entry",
      targetId: entry.id,
      diff: { before: null, after: { versionId: v1.id, locale: "en" } },
    });
    expect(second?.diff).toEqual({
      before: { versionId: v1.id },
      after: { versionId: v2.id, locale: "en" },
    });
  });

  it("returns field errors under data and writes nothing", async () => {
    const editor = await member("editor");
    const entry = await entryBy(editor);
    const error = await errorOf(save(editor, { entryId: entry.id, data: { title: 5, extra: 1 } }));
    expect(error.code).toBe("invalid_input");
    expect(error.fieldErrors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        ["data", "title"],
        ["data", "extra"],
      ]),
    );
    expect(await versionCount()).toBe(0);
    expect(await saveAudits()).toEqual([]);
  });

  it("refuses bad references with stable codes and no audit row", async () => {
    const editor = await member("editor");
    const entry = await entryBy(editor);
    const other = await entryBy(editor);
    const otherV = await save(editor, { entryId: other.id });
    const unknownType = await entryBy(editor, "post");
    const foreign = await entryBy({ type: "system", id: "seed" }, "page", siteB);

    expect(await codeOf(save(editor, { entryId: unknownType.id }))).toBe("unknown_content_type");
    expect(await codeOf(save(editor, { entryId: crypto.randomUUID() }))).toBe("entry_not_found");
    expect(await codeOf(save(editor, { entryId: foreign.id }))).toBe("entry_not_found");
    expect(await codeOf(save(editor, { entryId: entry.id, locale: "de" }))).toBe("invalid_locale");
    expect(await codeOf(save(editor, { entryId: entry.id, baseVersionId: otherV.id }))).toBe(
      "version_not_found",
    );
    expect(
      await codeOf(save(editor, { entryId: entry.id, baseVersionId: crypto.randomUUID() })),
    ).toBe("version_not_found");

    const v1 = await save(editor, { entryId: entry.id });
    await save(editor, { entryId: entry.id, baseVersionId: v1.id });
    expect(await codeOf(save(editor, { entryId: entry.id, baseVersionId: v1.id }))).toBe(
      "version_conflict",
    );
    expect(await codeOf(save(editor, { entryId: entry.id, baseVersionId: null }))).toBe(
      "version_conflict",
    );
    expect(await saveAudits()).toHaveLength(3);
    expect(await versionCount(siteB)).toBe(0);
  });

  it("lets an Author save only on entries they created", async () => {
    const author = await member("author");
    const otherAuthor = await member("author");
    const editor = await member("editor");
    const own = await entryBy(author);
    const theirs = await entryBy(otherAuthor);
    const noCreator = await createEntry(db, siteA, { slug: "legacy", typeKey: "page" });

    expect(await codeOf(save(author, { entryId: own.id }))).toBe("ok");
    expect(await codeOf(save(author, { entryId: theirs.id }))).toBe("forbidden");
    expect(await codeOf(save(author, { entryId: noCreator.id }))).toBe("forbidden");
    expect(await codeOf(save(editor, { entryId: theirs.id }))).toBe("ok");
    expect(await codeOf(save(editor, { entryId: noCreator.id }))).toBe("ok");
    expect(await saveAudits()).toHaveLength(3);
  });

  it("refuses viewers, agents, non-members and members of another site", async () => {
    const editor = await member("editor");
    const entry = await entryBy(editor);
    const viewer = await member("viewer");
    const outsider = await member("owner", siteB);
    const agent: Actor = { type: "agent", id: "token_1" };
    for (const actor of [
      viewer,
      outsider,
      agent,
      { type: "user", id: crypto.randomUUID() } as Actor,
    ]) {
      expect(await codeOf(save(actor, { entryId: entry.id }))).toBe("forbidden");
    }
    expect(await versionCount()).toBe(0);
    expect(await saveAudits()).toEqual([]);
  });

  it("refuses a user demoted or removed after the authorizer ran", async () => {
    const editor = await member("editor");
    const removed = await member("editor");
    const entry = await entryBy(editor);
    const allowed = roleAuthorizer(db);
    // Changes the actor's membership after the authorizer has said yes.
    const racing: Authorizer = async (actor, permission, scope) => {
      const ok = await allowed(actor, permission, scope);
      await withSite(db, siteA, async (tx) => {
        if (actor.id === editor.id) await setMembershipInTx(tx, siteA, actor.id, "viewer");
        else await tx.execute(sql`DELETE FROM memberships WHERE user_id = ${actor.id}`);
      });
      return ok;
    };
    for (const actor of [editor, removed]) {
      expect(
        await codeOf(
          runCommand({ ...deps, authorize: racing }, saveDraftCommand, actor, {
            siteId: siteA,
            entryId: entry.id,
            locale: "en",
            baseVersionId: null,
            data: { title: "Late" },
          }),
        ),
      ).toBe("forbidden");
    }
    expect(await versionCount()).toBe(0);
    expect(await saveAudits()).toEqual([]);
  });

  it("lets a system actor save", async () => {
    const entry = await entryBy(system);
    expect((await save(system, { entryId: entry.id })).actorType).toBe("system");
  });

  it("keeps one of two concurrent saves on the same base", async () => {
    const editor = await member("editor");
    const entry = await entryBy(editor);
    const v1 = await save(editor, { entryId: entry.id });
    const results = await Promise.all(
      ["A", "B"].map((title) =>
        codeOf(save(editor, { entryId: entry.id, baseVersionId: v1.id, data: { title } })),
      ),
    );
    expect(results.sort()).toEqual(["ok", "version_conflict"]);
    expect(await versionCount()).toBe(2);
    expect(await saveAudits()).toHaveLength(2);
  });

  it("refuses a registry with a duplicate content type", async () => {
    const entry = await entryBy(system);
    await expect(
      runCommand({ ...deps, contentTypes: [page, page] }, saveDraftCommand, system, {
        siteId: siteA,
        entryId: entry.id,
        locale: "en",
        baseVersionId: null,
        data: { title: "x" },
      }),
    ).rejects.toThrow(/defined twice/);
  });
});
