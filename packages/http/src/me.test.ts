import { createSite, findOrCreateUser, setMembershipInTx, withSite } from "@cms/db";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./test/db.js";
import { fakeAuth } from "./test/fake-auth.js";
import { injector } from "./test/inject.js";

const { db } = useTestDb();
const auth = fakeAuth({
  "token-ada": { authId: "user_ada", email: "Ada@Example.com", name: "Ada" },
  "token-bob": { authId: "user_bob", email: "bob@example.com", name: null },
  "token-eve": { authId: "user_eve", email: "ada@example.com", name: "Eve", unverified: true },
});
const app = { inject: injector({ db, auth: auth.adapter }) };

const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };

async function userCount() {
  const { rows } = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users`);
  return rows[0]?.n;
}

describe("GET /api/healthz", () => {
  it("is public", async () => {
    const res = await app.inject({ method: "GET", url: "/api/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/me", () => {
  it("returns 401 without creating a user for a missing, malformed or rejected token", async () => {
    for (const authorization of [
      undefined,
      "token-ada",
      "Basic token-ada",
      "Bearer ",
      "Bearer nope",
    ]) {
      const res = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: authorization === undefined ? {} : { authorization },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "unauthenticated" });
    }
    expect(await userCount()).toBe(0);
  });

  it("refuses a person whose email is not verified, without creating a user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer token-eve" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "email_not_verified" });
    expect(await userCount()).toBe(0);
  });

  it("creates the user on first sight, once, and fetches the profile only then", async () => {
    const before = auth.calls.getProfile;
    const first = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer token-ada" },
    });
    const second = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer token-ada" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual(second.json());
    expect(first.json().user).toMatchObject({ email: "ada@example.com", name: "Ada" });
    expect(first.json().memberships).toEqual([]);
    expect(await userCount()).toBe(1);
    expect(auth.calls.getProfile - before).toBe(1);
  });

  it("returns only the caller's own memberships", async () => {
    const alpha = await createSite(db, { ...base, name: "Alpha" });
    const beta = await createSite(db, { ...base, name: "Beta" });
    const ada = await findOrCreateUser(db, {
      authId: "user_ada",
      email: "ada@example.com",
      name: "Ada",
    });
    const bob = await findOrCreateUser(db, {
      authId: "user_bob",
      email: "bob@example.com",
      name: null,
    });
    await withSite(db, alpha.id, (tx) => setMembershipInTx(tx, alpha.id, ada.id, "owner"));
    await withSite(db, beta.id, async (tx) => {
      await setMembershipInTx(tx, beta.id, bob.id, "editor");
      await setMembershipInTx(tx, beta.id, ada.id, "viewer");
    });

    const asBob = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer token-bob" },
    });
    expect(asBob.json()).toEqual({
      user: { id: bob.id, email: "bob@example.com", name: null },
      memberships: [{ siteId: beta.id, siteName: "Beta", role: "editor" }],
    });
    const asAda = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer token-ada" },
    });
    expect(asAda.json().memberships).toEqual([
      { siteId: alpha.id, siteName: "Alpha", role: "owner" },
      { siteId: beta.id, siteName: "Beta", role: "viewer" },
    ]);
  });
});
