import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DbError } from "./errors.js";
import type { Site } from "./schema.js";
import { withSite } from "./site-scope.js";
import { createSite } from "./sites.js";
import { useTestDb } from "./test/db.js";
import {
  countOwnersInTx,
  findOrCreateUser,
  findUserByAuthId,
  findUsersByEmail,
  getMembership,
  listMembershipsForUser,
  setMembershipInTx,
} from "./users.js";

const { db } = useTestDb();

let siteA: Site;
let siteB: Site;

beforeEach(async () => {
  const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };
  siteA = await createSite(db, { ...base, name: "Alpha" });
  siteB = await createSite(db, { ...base, name: "Beta" });
});

const ada = { authId: "user_ada", email: "Ada@Example.com", name: "Ada" };
const bob = { authId: "user_bob", email: "bob@example.com", name: null };

describe("users", () => {
  it("creates a user once per auth id and follows the provider's profile", async () => {
    const first = await findOrCreateUser(db, ada);
    expect(first).toMatchObject({ authId: "user_ada", email: "ada@example.com", name: "Ada" });
    const again = await findOrCreateUser(db, { ...ada, email: "ada@new.example", name: "Ada L" });
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ email: "ada@new.example", name: "Ada L" });
    expect((await findUserByAuthId(db, "user_ada"))?.id).toBe(first.id);
    expect(await findUserByAuthId(db, "user_nobody")).toBeNull();
  });

  it("creates one row when first requests arrive concurrently", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => findOrCreateUser(db, ada)));
    expect(new Set(results.map((u) => u.id)).size).toBe(1);
    const { rows } = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users`);
    expect(rows[0]?.n).toBe(1);
  });

  it("finds users by email ignoring case", async () => {
    const user = await findOrCreateUser(db, ada);
    expect((await findUsersByEmail(db, "ADA@example.com")).map((u) => u.id)).toEqual([user.id]);
    expect(await findUsersByEmail(db, "nobody@example.com")).toEqual([]);
  });
});

describe("memberships", () => {
  it("sets and changes one role per user and site", async () => {
    const user = await findOrCreateUser(db, ada);
    const first = await withSite(db, siteA.id, (tx) =>
      setMembershipInTx(tx, siteA.id, user.id, "editor"),
    );
    expect(first).toEqual({ before: null, after: "editor" });
    const second = await withSite(db, siteA.id, (tx) =>
      setMembershipInTx(tx, siteA.id, user.id, "admin"),
    );
    expect(second).toEqual({ before: "editor", after: "admin" });
    expect((await getMembership(db, siteA.id, user.id))?.role).toBe("admin");
    expect(await getMembership(db, siteB.id, user.id)).toBeNull();
  });

  it("rejects an unknown user and an unknown role", async () => {
    await expect(
      withSite(db, siteA.id, (tx) =>
        setMembershipInTx(tx, siteA.id, "00000000-0000-4000-8000-000000000000", "viewer"),
      ),
    ).rejects.toMatchObject({ code: "user_not_found" });
    const user = await findOrCreateUser(db, ada);
    await expect(
      withSite(db, siteA.id, (tx) => setMembershipInTx(tx, siteA.id, user.id, "root" as "viewer")),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    expect(new DbError("last_owner", "x").code).toBe("last_owner");
  });

  it("counts owners per site", async () => {
    const a = await findOrCreateUser(db, ada);
    const b = await findOrCreateUser(db, bob);
    await withSite(db, siteA.id, async (tx) => {
      await setMembershipInTx(tx, siteA.id, a.id, "owner");
      await setMembershipInTx(tx, siteA.id, b.id, "owner");
    });
    await withSite(db, siteB.id, (tx) => setMembershipInTx(tx, siteB.id, a.id, "owner"));
    expect(await withSite(db, siteA.id, (tx) => countOwnersInTx(tx, siteA.id))).toBe(2);
    expect(await withSite(db, siteB.id, (tx) => countOwnersInTx(tx, siteB.id))).toBe(1);
  });

  it("lists a user's own memberships across sites, and nobody else's", async () => {
    const a = await findOrCreateUser(db, ada);
    const b = await findOrCreateUser(db, bob);
    await withSite(db, siteA.id, (tx) => setMembershipInTx(tx, siteA.id, a.id, "owner"));
    await withSite(db, siteB.id, async (tx) => {
      await setMembershipInTx(tx, siteB.id, a.id, "viewer");
      await setMembershipInTx(tx, siteB.id, b.id, "editor");
    });
    expect(await listMembershipsForUser(db, a.id)).toEqual([
      { siteId: siteA.id, siteName: "Alpha", role: "owner" },
      { siteId: siteB.id, siteName: "Beta", role: "viewer" },
    ]);
    expect(await listMembershipsForUser(db, b.id)).toEqual([
      { siteId: siteB.id, siteName: "Beta", role: "editor" },
    ]);
  });

  it("hides another site's memberships and refuses writing them", async () => {
    const a = await findOrCreateUser(db, ada);
    await withSite(db, siteB.id, (tx) => setMembershipInTx(tx, siteB.id, a.id, "editor"));
    const visible = await withSite(db, siteA.id, async (tx) => {
      const { rows } = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM memberships`,
      );
      return rows[0]?.n;
    });
    expect(visible).toBe(0);
    await expect(
      withSite(db, siteA.id, (tx) => setMembershipInTx(tx, siteB.id, a.id, "owner")),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });
});
