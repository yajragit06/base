import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { baseTableNames, formatChecks, runDoctor } from "./doctor.js";
import { createDb } from "./index.js";
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

  it("fails on a column-level grant too", async () => {
    await db.execute(
      sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$`,
    );
    await db.execute(sql`GRANT SELECT (email) ON users TO anon`);
    try {
      expect((await byName())["api roles"]).toMatchObject({
        ok: false,
        detail: "privileges granted: anon on users",
      });
    } finally {
      await db.execute(sql`REVOKE SELECT (email) ON users FROM anon`);
    }
  });

  it("fails the role check for a user who cannot switch to cms_app", async () => {
    const role = `doctor_probe_${process.pid}`;
    await db.execute(sql.raw(`CREATE ROLE ${role} LOGIN PASSWORD 'probe-password'`));
    const url = new URL(process.env.TEST_DATABASE_URL ?? "");
    url.username = role;
    url.password = "probe-password";
    const probe = createDb(url.toString());
    try {
      const checks = Object.fromEntries((await runDoctor(probe.db)).map((c) => [c.name, c]));
      expect(checks.role).toMatchObject({ ok: false });
    } finally {
      await probe.pool.end();
      await db.execute(sql.raw(`DROP ROLE ${role}`));
    }
  });

  it("fails the migrations check when migrations are missing", async () => {
    // A fresh schema-less view of the check: an unmigrated database has no journal rows.
    const { rows } = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
    );
    expect(rows[0]?.n).toBeGreaterThan(0);
    await db.execute(
      sql`ALTER TABLE drizzle.__drizzle_migrations RENAME TO __drizzle_migrations_hidden`,
    );
    try {
      expect((await byName()).migrations).toMatchObject({
        ok: false,
        detail: expect.stringMatching(/^0 of \d+ applied$/),
      });
    } finally {
      await db.execute(
        sql`ALTER TABLE drizzle.__drizzle_migrations_hidden RENAME TO __drizzle_migrations`,
      );
    }
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
