import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { baseTableNames, formatChecks, runDoctor } from "./doctor.js";
import { useTestDb } from "./test/db.js";

const { db } = useTestDb();

const byName = async () => Object.fromEntries((await runDoctor(db)).map((c) => [c.name, c]));

describe("db:doctor", () => {
  it("passes every check on a migrated database", async () => {
    const checks = await runDoctor(db);
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ["migrations", true],
      ["role", true],
      ["api roles", true],
      ["row-level security", true],
    ]);
    expect(formatChecks(checks)).toMatch(/^ok {3}migrations: \d+ of \d+ applied$/m);
    expect(baseTableNames()).toEqual(
      expect.arrayContaining(["sites", "domains", "users", "entries", "versions", "audit_log"]),
    );
  });

  it("fails when an API role is granted a privilege on a Base table", async () => {
    await db.execute(
      sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$`,
    );
    await db.execute(sql`GRANT SELECT ON sites TO anon`);
    try {
      const { "api roles": check } = await byName();
      expect(check).toMatchObject({ ok: false, detail: "privileges granted: anon on sites" });
    } finally {
      await db.execute(sql`REVOKE SELECT ON sites FROM anon`);
    }
    expect((await byName())["api roles"]?.ok).toBe(true);
  });

  it("fails when row-level security is off on a Base table", async () => {
    await db.execute(sql`ALTER TABLE domains DISABLE ROW LEVEL SECURITY`);
    try {
      const { "row-level security": check } = await byName();
      expect(check).toMatchObject({ ok: false, detail: "disabled on domains" });
    } finally {
      await db.execute(sql`ALTER TABLE domains ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("never mentions the connection string", async () => {
    const text = formatChecks(await runDoctor(db));
    const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://x");
    expect(text).not.toContain(url.host);
    expect(text).not.toContain(url.toString());
    // Short test passwords such as "cms" are also substrings of "cms_app".
    if (url.password.length >= 8) expect(text).not.toContain(url.password);
  });
});
