import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createEntry, getEntry, getEntryByUri, listChildren } from "./entries.js";
import { DbError } from "./errors.js";
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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DbError) return error.code;
    throw error;
  }
  return "ok";
}

describe("createEntry", () => {
  it("computes URI and path for top-level and nested entries", async () => {
    const about = await createEntry(db, siteA.id, { slug: "about", typeKey: "page" });
    const team = await createEntry(db, siteA.id, {
      parentId: about.id,
      slug: "our-team",
      typeKey: "page",
    });
    expect(about).toMatchObject({ siteId: siteA.id, parentId: null, sortOrder: 0, uri: "/about" });
    expect(about.path).toBe(`/${about.id}/`);
    expect(team).toMatchObject({ parentId: about.id, sortOrder: 0, uri: "/about/our-team" });
    expect(team.path).toBe(`/${about.id}/${team.id}/`);
  });

  it("appends after existing siblings and lists children in order", async () => {
    const news = await createEntry(db, siteA.id, { slug: "news", typeKey: "page" });
    for (const slug of ["first", "second", "third"]) {
      await createEntry(db, siteA.id, { parentId: news.id, slug, typeKey: "article" });
    }
    const children = await listChildren(db, siteA.id, news.id);
    expect(children.map((c) => [c.slug, c.sortOrder])).toEqual([
      ["first", 0],
      ["second", 1],
      ["third", 2],
    ]);
    expect((await listChildren(db, siteA.id, null)).map((c) => c.slug)).toEqual(["news"]);
  });

  it("rejects a duplicate URI but allows the same slug under another parent or site", async () => {
    const a = await createEntry(db, siteA.id, { slug: "a", typeKey: "page" });
    const b = await createEntry(db, siteA.id, { slug: "b", typeKey: "page" });
    await createEntry(db, siteA.id, { parentId: a.id, slug: "x", typeKey: "page" });
    expect(
      await codeOf(createEntry(db, siteA.id, { parentId: a.id, slug: "x", typeKey: "page" })),
    ).toBe("uri_taken");
    expect(await codeOf(createEntry(db, siteA.id, { slug: "a", typeKey: "page" }))).toBe(
      "uri_taken",
    );
    expect(
      await codeOf(createEntry(db, siteA.id, { parentId: b.id, slug: "x", typeKey: "page" })),
    ).toBe("ok");
    expect(await codeOf(createEntry(db, siteB.id, { slug: "a", typeKey: "page" }))).toBe("ok");
  });

  it("rejects invalid slugs and type keys", async () => {
    for (const slug of ["About", "about us", "-about", "", "a--b"]) {
      expect(await codeOf(createEntry(db, siteA.id, { slug, typeKey: "page" }))).toBe(
        "invalid_slug",
      );
    }
    for (const typeKey of ["Page", "landing-page", ""]) {
      expect(await codeOf(createEntry(db, siteA.id, { slug: "a", typeKey }))).toBe(
        "invalid_type_key",
      );
    }
  });

  it("rejects a parent from another site or one that does not exist", async () => {
    const other = await createEntry(db, siteB.id, { slug: "b", typeKey: "page" });
    expect(
      await codeOf(createEntry(db, siteA.id, { parentId: other.id, slug: "x", typeKey: "page" })),
    ).toBe("parent_not_found");
    expect(
      await codeOf(
        createEntry(db, siteA.id, {
          parentId: "00000000-0000-4000-8000-000000000000",
          slug: "x",
          typeKey: "page",
        }),
      ),
    ).toBe("parent_not_found");
    expect(
      await codeOf(createEntry(db, siteA.id, { parentId: "nope", slug: "x", typeKey: "page" })),
    ).toBe("parent_not_found");
  });

  it("rejects an unknown site", async () => {
    expect(
      await codeOf(
        createEntry(db, "00000000-0000-4000-8000-000000000000", { slug: "a", typeKey: "page" }),
      ),
    ).toBe("site_not_found");
    expect(await codeOf(createEntry(db, "nope", { slug: "a", typeKey: "page" }))).toBe(
      "site_not_found",
    );
  });

  it("gives concurrent creates under one parent distinct sort orders", async () => {
    const parent = await createEntry(db, siteA.id, { slug: "p", typeKey: "page" });
    const slugs = Array.from({ length: 10 }, (_, i) => `child-${i}`);
    await Promise.all(
      slugs.map((slug) =>
        createEntry(db, siteA.id, { parentId: parent.id, slug, typeKey: "page" }),
      ),
    );
    const orders = (await listChildren(db, siteA.id, parent.id)).map((c) => c.sortOrder);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("gives concurrent top-level creates distinct sort orders", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createEntry(db, siteA.id, { slug: `top-${i}`, typeKey: "page" }),
      ),
    );
    const orders = (await listChildren(db, siteA.id, null)).map((c) => c.sortOrder);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("reads", () => {
  it("finds entries by id and URI within their site", async () => {
    const about = await createEntry(db, siteA.id, { slug: "about", typeKey: "page" });
    expect((await getEntry(db, siteA.id, about.id))?.uri).toBe("/about");
    expect((await getEntryByUri(db, siteA.id, "/about"))?.id).toBe(about.id);
    expect(await getEntryByUri(db, siteA.id, "/missing")).toBeNull();
    expect(await getEntry(db, siteA.id, "not-a-uuid")).toBeNull();
  });

  it("never returns another site's entries", async () => {
    const about = await createEntry(db, siteA.id, { slug: "about", typeKey: "page" });
    await createEntry(db, siteA.id, { parentId: about.id, slug: "team", typeKey: "page" });
    expect(await getEntry(db, siteB.id, about.id)).toBeNull();
    expect(await getEntryByUri(db, siteB.id, "/about")).toBeNull();
    expect(await listChildren(db, siteB.id, about.id)).toEqual([]);
    expect(await listChildren(db, siteB.id, null)).toEqual([]);
  });
});

describe("row-level security", () => {
  it("shows a site-scoped transaction only its own site's rows", async () => {
    await createEntry(db, siteA.id, { slug: "a", typeKey: "page" });
    await createEntry(db, siteB.id, { slug: "b", typeKey: "page" });
    const rows = await withSite(db, siteA.id, async (tx) => {
      const result = await tx.execute<{ slug: string }>(sql`SELECT slug FROM entries`);
      return result.rows.map((r) => r.slug);
    });
    expect(rows).toEqual(["a"]);
  });

  it("rejects writing another site's rows", async () => {
    await expect(
      withSite(db, siteA.id, (tx) =>
        tx.execute(
          sql`INSERT INTO entries (site_id, sort_order, slug, uri, path, type_key)
              VALUES (${siteB.id}, 0, 'x', '/x', '/x/', 'page')`,
        ),
      ),
    ).rejects.toThrow();
    const b = await createEntry(db, siteB.id, { slug: "b", typeKey: "page" });
    const updated = await withSite(db, siteA.id, (tx) =>
      tx.execute(sql`UPDATE entries SET slug = 'hacked' WHERE id = ${b.id}`),
    );
    expect(updated.rowCount).toBe(0);
  });

  it("shows no rows when no site is set", async () => {
    await createEntry(db, siteA.id, { slug: "a", typeKey: "page" });
    const count = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE cms_app`);
      const result = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM entries`);
      return result.rows[0]?.n;
    });
    expect(count).toBe(0);
  });
});
