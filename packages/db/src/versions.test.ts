import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createEntry } from "./entries.js";
import { DbError } from "./errors.js";
import { type Entry, type Site, versions } from "./schema.js";
import { withSite } from "./site-scope.js";
import { createSite } from "./sites.js";
import { useTestDb } from "./test/db.js";
import {
  appendVersionInTx,
  getLatestVersion,
  getVersion,
  latestVersionQuery,
  listVersions,
  type NewVersion,
} from "./versions.js";

const { db } = useTestDb();

let siteA: Site;
let siteB: Site;
let entry: Entry;

beforeEach(async () => {
  const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en", "fr"] };
  siteA = await createSite(db, { ...base, name: "A" });
  siteB = await createSite(db, { ...base, name: "B" });
  entry = await createEntry(db, siteA.id, {
    slug: "about",
    typeKey: "page",
    createdBy: { type: "user", id: "u1" },
  });
});

function draft(overrides: Partial<NewVersion> = {}): NewVersion {
  return {
    entryId: entry.id,
    locale: "en",
    data: { title: "Hello" },
    schemaVersion: 1,
    actorType: "user",
    actorId: "u1",
    basedOnVersionId: null,
    ...overrides,
  };
}

function append(siteId: string, input: NewVersion) {
  return withSite(db, siteId, (tx) => appendVersionInTx(tx, siteId, input));
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DbError) return error.code;
    throw error;
  }
  return "ok";
}

// The table owner, not cms_app. FORCE row-level security still applies to a non-superuser
// owner, so the site setting is needed to reach the row at all.
function asOwner<T>(
  siteId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.site_id', ${siteId}, true)`);
    return fn(tx);
  });
}

async function pgMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? String(error);
  }
  return "ok";
}

describe("entries", () => {
  it("records the creator", async () => {
    expect(entry).toMatchObject({ createdByType: "user", createdById: "u1" });
    const bare = await createEntry(db, siteA.id, { slug: "bare", typeKey: "page" });
    expect(bare).toMatchObject({ createdByType: null, createdById: null });
  });
});

describe("appendVersionInTx", () => {
  it("builds a linear chain per locale and reads the latest", async () => {
    const v1 = await append(siteA.id, draft());
    const v2 = await append(siteA.id, draft({ basedOnVersionId: v1.id, data: { title: "Two" } }));
    const fr = await append(siteA.id, draft({ locale: "fr" }));
    expect(v1).toMatchObject({ status: "draft", schemaVersion: 1, ai: null, siteId: siteA.id });
    expect((await getLatestVersion(db, siteA.id, entry.id, "en"))?.id).toBe(v2.id);
    expect((await getLatestVersion(db, siteA.id, entry.id, "fr"))?.id).toBe(fr.id);
    expect(await getLatestVersion(db, siteA.id, entry.id, "de")).toBeNull();
    expect((await getVersion(db, siteA.id, v1.id))?.data).toEqual({ title: "Hello" });
    expect((await listVersions(db, siteA.id, entry.id, { locale: "en" })).map((v) => v.id)).toEqual(
      [v2.id, v1.id],
    );
    expect(await listVersions(db, siteA.id, entry.id, { limit: 1 })).toHaveLength(1);
  });

  it("refuses a second first version or a second successor", async () => {
    const v1 = await append(siteA.id, draft());
    expect(await codeOf(append(siteA.id, draft()))).toBe("version_conflict");
    await append(siteA.id, draft({ basedOnVersionId: v1.id }));
    expect(await codeOf(append(siteA.id, draft({ basedOnVersionId: v1.id })))).toBe(
      "version_conflict",
    );
  });

  it("allows one of two concurrent saves on the same base", async () => {
    const v1 = await append(siteA.id, draft());
    const results = await Promise.all(
      [1, 2].map(() => codeOf(append(siteA.id, draft({ basedOnVersionId: v1.id })))),
    );
    expect(results.sort()).toEqual(["ok", "version_conflict"]);
  });

  it("refuses a base from another locale or entry", async () => {
    const other = await createEntry(db, siteA.id, { slug: "other", typeKey: "page" });
    const fr = await append(siteA.id, draft({ locale: "fr" }));
    const otherV = await append(siteA.id, draft({ entryId: other.id }));
    expect(await codeOf(append(siteA.id, draft({ basedOnVersionId: fr.id })))).toBe(
      "version_not_found",
    );
    expect(await codeOf(append(siteA.id, draft({ basedOnVersionId: otherV.id })))).toBe(
      "version_not_found",
    );
  });

  it("keeps sites apart", async () => {
    const v1 = await append(siteA.id, draft());
    expect(await getVersion(db, siteB.id, v1.id)).toBeNull();
    expect(await getLatestVersion(db, siteB.id, entry.id, "en")).toBeNull();
    expect(await listVersions(db, siteB.id, entry.id)).toEqual([]);
    expect(await withSite(db, siteB.id, (tx) => tx.select().from(versions))).toEqual([]);
    // An entry of site A cannot gain a version from inside site B.
    expect(await codeOf(append(siteB.id, draft({ basedOnVersionId: null, locale: "de" })))).toBe(
      "entry_not_found",
    );
    // Row-level security refuses a row claiming another site.
    expect(
      await pgMessage(
        withSite(db, siteB.id, (tx) =>
          tx.insert(versions).values({ ...draft({ locale: "de" }), siteId: siteA.id }),
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

describe("immutability", () => {
  it("rejects data changes and deletes, even as the table owner", async () => {
    const v1 = await append(siteA.id, draft());
    expect(
      await pgMessage(
        asOwner(siteA.id, (tx) =>
          tx
            .update(versions)
            .set({ data: { title: "Changed" } })
            .where(eq(versions.id, v1.id)),
        ),
      ),
    ).toMatch(/versions are immutable/);
    expect(
      await pgMessage(
        asOwner(siteA.id, (tx) =>
          tx.update(versions).set({ locale: "fr" }).where(eq(versions.id, v1.id)),
        ),
      ),
    ).toMatch(/versions are immutable/);
    expect(
      await pgMessage(asOwner(siteA.id, (tx) => tx.delete(versions).where(eq(versions.id, v1.id)))),
    ).toMatch(/versions are immutable/);
    expect(
      await pgMessage(
        withSite(db, siteA.id, (tx) => tx.delete(versions).where(eq(versions.id, v1.id))),
      ),
    ).toMatch(/versions are immutable/);
    expect((await getVersion(db, siteA.id, v1.id))?.data).toEqual({ title: "Hello" });
  });

  it("allows a status change", async () => {
    const v1 = await append(siteA.id, draft());
    const updated = await asOwner(siteA.id, (tx) =>
      tx.update(versions).set({ status: "published" }).where(eq(versions.id, v1.id)).returning(),
    );
    expect(updated).toHaveLength(1);
    expect((await getVersion(db, siteA.id, v1.id))?.status).toBe("published");
  });
});

describe("listVersions", () => {
  it("clamps the limit to 1..100", async () => {
    let base: string | null = null;
    for (let i = 0; i < 3; i++)
      base = (await append(siteA.id, draft({ basedOnVersionId: base }))).id;
    expect(await listVersions(db, siteA.id, entry.id, { limit: 0 })).toHaveLength(1);
    expect(await listVersions(db, siteA.id, entry.id, { limit: -5 })).toHaveLength(1);
    expect(await listVersions(db, siteA.id, entry.id, { limit: Number.NaN })).toHaveLength(3);
    expect(await listVersions(db, siteA.id, entry.id, { limit: 1000 })).toHaveLength(3);
  });
});

describe("latest-version query plan", () => {
  it("looks up successors through an index, not a scan of the site's versions", async () => {
    // 200 entries x 20 versions each, so the planner prefers indexes when it can.
    await asOwner(siteA.id, async (tx) => {
      await tx.execute(sql`
        INSERT INTO entries (id, site_id, sort_order, slug, uri, path, type_key)
        SELECT gen_random_uuid(), ${siteA.id}, n, 'bulk-' || n, '/bulk-' || n, '/x' || n || '/', 'page'
        FROM generate_series(1, 200) AS n`);
      await tx.execute(sql`
        WITH RECURSIVE chain(entry_id, n, id) AS (
          SELECT e.id, 1, gen_random_uuid() FROM entries e WHERE e.slug LIKE 'bulk-%'
          UNION ALL
          SELECT entry_id, n + 1, gen_random_uuid() FROM chain WHERE n < 20
        ), rows AS (
          SELECT entry_id, n, id, lag(id) OVER (PARTITION BY entry_id ORDER BY n) AS prev FROM chain
        )
        INSERT INTO versions (id, site_id, entry_id, locale, data, schema_version, actor_type, actor_id, based_on_version_id)
        SELECT id, ${siteA.id}, entry_id, 'en', '{}', 1, 'system', 'seed', prev FROM rows ORDER BY entry_id, n`);
    });
    await db.execute(sql`ANALYZE versions`);
    const plan = await withSite(db, siteA.id, async (tx) => {
      const { rows } = await tx.execute<{ "QUERY PLAN": unknown }>(
        sql`EXPLAIN (FORMAT JSON) ${latestVersionQuery(tx, siteA.id, entry.id, "en")}`,
      );
      return JSON.stringify(rows[0]?.["QUERY PLAN"]);
    });
    expect(plan).not.toContain('"Seq Scan"');
  });
});
