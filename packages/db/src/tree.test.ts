import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { childrenPageQuery, createEntry, listChildrenPage, type TreeNode } from "./entries.js";
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

/** Inserts `count` children under `parentId` (or top level) in one statement. */
async function bulkChildren(
  siteId: string,
  parentId: string | null,
  count: number,
  prefix: string,
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.site_id', ${siteId}, true)`);
    await tx.execute(sql`
      INSERT INTO entries (id, site_id, parent_id, sort_order, slug, uri, path, type_key)
      SELECT gen_random_uuid(), ${siteId}, ${parentId}::uuid, n % 50, ${prefix} || n,
             '/' || ${prefix} || n, '/x' || n || '/', 'page'
      FROM generate_series(1, ${count}) AS n`);
  });
}

async function all(siteId: string, parentId: string | null, limit?: number) {
  const seen: TreeNode[] = [];
  let after: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await listChildrenPage(db, siteId, parentId, { after, limit });
    seen.push(...page.items);
    pages += 1;
    if (page.nextCursor === null) return { seen, pages };
    after = page.nextCursor;
  }
}

function inTreeOrder(nodes: TreeNode[]): boolean {
  return nodes.every((node, i) => {
    const prev = nodes[i - 1];
    return (
      prev === undefined ||
      prev.sortOrder < node.sortOrder ||
      (prev.sortOrder === node.sortOrder && prev.id < node.id)
    );
  });
}

describe("listChildrenPage", () => {
  it("pages through 5,000 children of one parent exactly once, in order", async () => {
    const parent = await createEntry(db, siteA.id, { slug: "big", typeKey: "page" });
    await bulkChildren(siteA.id, parent.id, 5000, "c");
    const { seen, pages } = await all(siteA.id, parent.id);
    expect(seen).toHaveLength(5000);
    expect(new Set(seen.map((n) => n.id)).size).toBe(5000);
    expect(inTreeOrder(seen)).toBe(true);
    expect(pages).toBe(50);
  });

  it("pages through 5,000 top-level entries", async () => {
    await bulkChildren(siteA.id, null, 5000, "t");
    const { seen } = await all(siteA.id, null, 200);
    expect(seen).toHaveLength(5000);
    expect(new Set(seen.map((n) => n.id)).size).toBe(5000);
    expect(inTreeOrder(seen)).toBe(true);
  });

  it("flags nodes that have children", async () => {
    const parent = await createEntry(db, siteA.id, { slug: "about", typeKey: "page" });
    const leaf = await createEntry(db, siteA.id, { slug: "leaf", typeKey: "page" });
    const child = await createEntry(db, siteA.id, {
      parentId: parent.id,
      slug: "team",
      typeKey: "page",
    });
    const top = await listChildrenPage(db, siteA.id, null);
    expect(top.items.map((n) => [n.id, n.hasChildren])).toEqual([
      [parent.id, true],
      [leaf.id, false],
    ]);
    expect(top.nextCursor).toBeNull();
    expect((await listChildrenPage(db, siteA.id, parent.id)).items).toEqual([
      {
        id: child.id,
        parentId: parent.id,
        slug: "team",
        uri: "/about/team",
        typeKey: "page",
        sortOrder: 0,
        hasChildren: false,
      },
    ]);
  });

  it("keeps sites apart and refuses unknown parents and bad cursors", async () => {
    const a = await createEntry(db, siteA.id, { slug: "a", typeKey: "page" });
    await createEntry(db, siteB.id, { slug: "b", typeKey: "page" });
    expect((await listChildrenPage(db, siteB.id, null)).items.map((n) => n.slug)).toEqual(["b"]);
    expect(await codeOf(listChildrenPage(db, siteB.id, a.id))).toBe("parent_not_found");
    expect(await codeOf(listChildrenPage(db, siteA.id, crypto.randomUUID()))).toBe(
      "parent_not_found",
    );
    expect(await codeOf(listChildrenPage(db, siteA.id, "nope"))).toBe("parent_not_found");
    for (const after of ["!!", "e30", Buffer.from('{"s":1,"i":"x"}').toString("base64url")]) {
      expect(await codeOf(listChildrenPage(db, siteA.id, null, { after }))).toBe("invalid_cursor");
    }
  });

  it("clamps the page size to 1..200", async () => {
    await bulkChildren(siteA.id, null, 250, "p");
    expect((await listChildrenPage(db, siteA.id, null, { limit: 0 })).items).toHaveLength(1);
    expect((await listChildrenPage(db, siteA.id, null, { limit: 1000 })).items).toHaveLength(200);
    expect((await listChildrenPage(db, siteA.id, null)).items).toHaveLength(100);
  });

  it("reads one node's children through the parent index on a 5,000-node site", async () => {
    const parents: string[] = [];
    for (let p = 0; p < 50; p++) {
      const parent = await createEntry(db, siteA.id, { slug: `p${p}`, typeKey: "page" });
      parents.push(parent.id);
      await bulkChildren(siteA.id, parent.id, 100, `p${p}-c`);
    }
    await db.execute(sql`ANALYZE entries`);
    const parentId = parents[7] ?? null;
    const plan = await withSite(db, siteA.id, async (tx) => {
      const { rows } = await tx.execute(
        sql`EXPLAIN (FORMAT JSON) ${childrenPageQuery(tx, siteA.id, parentId, undefined, 101)}`,
      );
      return JSON.stringify(rows);
    });
    expect(plan).not.toContain('"Seq Scan"');
  });
});
