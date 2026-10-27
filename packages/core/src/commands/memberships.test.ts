import {
  type AuditEntry,
  createSite,
  findOrCreateUser,
  getMembership,
  type Role,
  schema,
  setMembershipInTx,
  withSite,
} from "@cms/db";
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../authorize.js";
import { runCommand } from "../command.js";
import { CommandError } from "../errors.js";
import { roleAuthorizer } from "../permissions.js";
import { useTestDb } from "../test/db.js";
import { grantMembershipCommand } from "./memberships.js";

const { db } = useTestDb();
const deps = { db, authorize: roleAuthorizer(db) };
const system: Actor = { type: "system", id: "test" };
const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };

let siteA: string;
let siteB: string;
let n = 0;

beforeEach(async () => {
  siteA = (await createSite(db, { ...base, name: "A" })).id;
  siteB = (await createSite(db, { ...base, name: "B" })).id;
});

async function newUser() {
  n += 1;
  return findOrCreateUser(db, { authId: `auth_${n}`, email: `u${n}@x.com`, name: null });
}

async function member(role: Role, siteId = siteA): Promise<Actor> {
  const user = await newUser();
  await withSite(db, siteId, (tx) => setMembershipInTx(tx, siteId, user.id, role));
  return { type: "user", id: user.id };
}

function grant(actor: Actor, siteId: string, userId: string, role: Role) {
  return runCommand(deps, grantMembershipCommand, actor, { siteId, userId, role });
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

function auditOf(siteId: string): Promise<AuditEntry[]> {
  return withSite(db, siteId, (tx) => tx.select().from(schema.auditLog));
}

describe("membership.grant", () => {
  it("lets a system actor make the first owner, and audits it", async () => {
    const user = await newUser();
    expect(await grant(system, siteA, user.id, "owner")).toEqual({
      siteId: siteA,
      userId: user.id,
      role: "owner",
    });
    const [audit, ...rest] = await auditOf(siteA);
    expect(rest).toEqual([]);
    expect(audit).toMatchObject({
      actorType: "system",
      action: "membership.grant",
      targetType: "membership",
      targetId: user.id,
      diff: { before: null, after: { role: "owner" } },
    });
  });

  it("lets owners and admins grant non-owner roles, and records the change", async () => {
    const admin = await member("admin");
    const target = await newUser();
    expect(await codeOf(grant(admin, siteA, target.id, "editor"))).toBe("ok");
    expect(await codeOf(grant(admin, siteA, target.id, "author"))).toBe("ok");
    expect((await getMembership(db, siteA, target.id))?.role).toBe("author");
    const last = (await auditOf(siteA)).find(
      (a) => a.diff && (a.diff as { before: unknown }).before !== null,
    );
    expect(last?.diff).toEqual({ before: { role: "editor" }, after: { role: "author" } });
  });

  it("refuses editors, authors and viewers", async () => {
    const target = await newUser();
    for (const role of ["editor", "author", "viewer"] as const) {
      expect(await codeOf(grant(await member(role), siteA, target.id, "viewer"))).toBe("forbidden");
    }
  });

  it("only lets an owner grant or change the owner role", async () => {
    const admin = await member("admin");
    const owner = await member("owner");
    const target = await newUser();
    expect(await codeOf(grant(admin, siteA, target.id, "owner"))).toBe("forbidden");
    expect(await codeOf(grant(admin, siteA, owner.id, "viewer"))).toBe("forbidden");
    expect(await codeOf(grant(owner, siteA, target.id, "owner"))).toBe("ok");
    expect(await codeOf(grant(owner, siteA, target.id, "admin"))).toBe("ok");
    expect((await auditOf(siteA)).length).toBe(2);
  });

  it("keeps at least one owner", async () => {
    const owner = await member("owner");
    expect(await codeOf(grant(owner, siteA, owner.id, "admin"))).toBe("last_owner");
    const second = await member("owner");
    expect(await codeOf(grant(owner, siteA, second.id, "editor"))).toBe("ok");
    expect(await codeOf(grant(owner, siteA, owner.id, "editor"))).toBe("last_owner");
  });

  it("never leaves zero owners when two owners demote each other at once", async () => {
    const a = await member("owner");
    const b = await member("owner");
    const results = await Promise.all([
      codeOf(grant(a, siteA, b.id, "admin")),
      codeOf(grant(b, siteA, a.id, "admin")),
    ]);
    expect(results.sort()).toEqual(["forbidden", "ok"].sort());
    const roles = [
      (await getMembership(db, siteA, a.id))?.role,
      (await getMembership(db, siteA, b.id))?.role,
    ];
    expect(roles.filter((r) => r === "owner")).toHaveLength(1);
  });

  it("refuses an unknown user", async () => {
    const owner = await member("owner");
    expect(
      await codeOf(grant(owner, siteA, "00000000-0000-4000-8000-000000000000", "viewer")),
    ).toBe("user_not_found");
  });

  it("refuses a cross-site grant and writes no audit row there", async () => {
    const ownerOfB = await member("owner", siteB);
    const target = await newUser();
    expect(await codeOf(grant(ownerOfB, siteA, target.id, "admin"))).toBe("forbidden");
    expect(await auditOf(siteA)).toEqual([]);
    expect(await getMembership(db, siteA, target.id)).toBeNull();
  });
});
