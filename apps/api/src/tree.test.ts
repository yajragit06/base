import {
  createEntry,
  createSite,
  findOrCreateUser,
  type Role,
  setMembershipInTx,
  withSite,
} from "@cms/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { useTestDb } from "./test/db.js";
import { fakeAuth } from "./test/fake-auth.js";

const { db } = useTestDb();
const auth = fakeAuth({
  "token-viewer": { authId: "user_viewer", email: "viewer@example.com", name: null },
  "token-outsider": { authId: "user_outsider", email: "out@example.com", name: null },
  "token-other": { authId: "user_other", email: "other@example.com", name: null },
});
const app = buildApp({ db, auth: auth.adapter });
afterAll(() => app.close());

const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };
let siteA: string;
let siteB: string;

async function grant(authId: string, email: string, siteId: string, role: Role) {
  const user = await findOrCreateUser(db, { authId, email, name: null });
  await withSite(db, siteId, (tx) => setMembershipInTx(tx, siteId, user.id, role));
}

beforeEach(async () => {
  siteA = (await createSite(db, { ...base, name: "A" })).id;
  siteB = (await createSite(db, { ...base, name: "B" })).id;
  await grant("user_viewer", "viewer@example.com", siteA, "viewer");
  await grant("user_other", "other@example.com", siteB, "owner");
  await findOrCreateUser(db, { authId: "user_outsider", email: "out@example.com", name: null });
});

function get(url: string, token?: string) {
  return app.inject({
    method: "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /sites/:siteId/tree", () => {
  it("returns 401 without a valid token", async () => {
    for (const token of [undefined, "nope"]) {
      const res = await get(`/sites/${siteA}/tree`, token);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "unauthenticated" });
    }
  });

  it("returns 403 to non-members and members of another site", async () => {
    for (const token of ["token-outsider", "token-other"]) {
      const res = await get(`/sites/${siteA}/tree`, token);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "forbidden" });
    }
    // A well-formed unknown site id does not reveal whether it exists.
    expect((await get(`/sites/${crypto.randomUUID()}/tree`, "token-viewer")).statusCode).toBe(403);
  });

  it("returns 404 for a malformed site id and a parent outside the site", async () => {
    const res = await get("/sites/not-a-uuid/tree", "token-viewer");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    const foreign = await createEntry(db, siteB, { slug: "b", typeKey: "page" });
    for (const parentId of [foreign.id, crypto.randomUUID(), "x"]) {
      const r = await get(`/sites/${siteA}/tree?parentId=${parentId}`, "token-viewer");
      expect(r.statusCode).toBe(404);
      expect(r.json()).toEqual({ error: "parent_not_found" });
    }
  });

  it("returns 400 for a bad cursor, limit or unknown parameter", async () => {
    expect((await get(`/sites/${siteA}/tree?after=zz`, "token-viewer")).json()).toEqual({
      error: "invalid_cursor",
    });
    for (const q of ["limit=0", "limit=201", "limit=abc", "extra=1"]) {
      const res = await get(`/sites/${siteA}/tree?${q}`, "token-viewer");
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid_input" });
    }
  });

  it("lets a viewer page through the tree, showing only this site", async () => {
    const about = await createEntry(db, siteA, { slug: "about", typeKey: "page" });
    await createEntry(db, siteA, { slug: "blog", typeKey: "page" });
    await createEntry(db, siteA, { slug: "contact", typeKey: "page" });
    const team = await createEntry(db, siteA, {
      parentId: about.id,
      slug: "team",
      typeKey: "page",
    });
    await createEntry(db, siteB, { slug: "elsewhere", typeKey: "page" });

    const first = await get(`/sites/${siteA}/tree?limit=2`, "token-viewer");
    expect(first.statusCode).toBe(200);
    const page1 = first.json();
    expect(page1.items.map((n: { slug: string }) => n.slug)).toEqual(["about", "blog"]);
    expect(page1.items[0].hasChildren).toBe(true);
    expect(page1.nextCursor).toEqual(expect.any(String));

    const page2 = (
      await get(`/sites/${siteA}/tree?limit=2&after=${page1.nextCursor}`, "token-viewer")
    ).json();
    expect(page2.items.map((n: { slug: string }) => n.slug)).toEqual(["contact"]);
    expect(page2.nextCursor).toBeNull();

    const children = (
      await get(`/sites/${siteA}/tree?parentId=${about.id}`, "token-viewer")
    ).json();
    expect(children).toEqual({
      items: [
        {
          id: team.id,
          parentId: about.id,
          slug: "team",
          uri: "/about/team",
          typeKey: "page",
          sortOrder: 0,
          hasChildren: false,
        },
      ],
      nextCursor: null,
    });
  });
});
