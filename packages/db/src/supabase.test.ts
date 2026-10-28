import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./index.js";
import { runMigrations } from "./migrations.js";
import { withSite, withUser } from "./site-scope.js";
import { addDomain, createSite } from "./sites.js";
import { testDatabaseUrl } from "./test/db.js";
import { findOrCreateUser, setMembershipInTx } from "./users.js";

// A fresh database set up the way Supabase sets up its projects: the Data API roles
// `anon` and `authenticated` exist and get every privilege on new public tables by
// default. Base's migrations must take those privileges away (rule 14).
const API_ROLES = ["anon", "authenticated"] as const;
const name = `base_supabase_${process.pid}`;
const adminUrl = testDatabaseUrl();
const freshUrl = (() => {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
})();

let handle: { db: Db; pool: pg.Pool };

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await admin(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${name}`);
    for (const role of API_ROLES) {
      await client.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
      );
    }
  });
  handle = createDb(freshUrl);
  const { db } = handle;
  // Supabase's defaults for objects the migrating user creates in public.
  for (const role of API_ROLES) {
    await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
    for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
      await db.execute(
        sql.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ${kind} TO ${role}`),
      );
    }
    // Lets this test act as the role, as PostgREST does.
    await db.execute(sql.raw(`GRANT ${role} TO CURRENT_USER`));
  }
  await runMigrations(db);
}, 60_000);

afterAll(async () => {
  await handle?.pool.end();
  await admin((client) => client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
});

async function baseTables(): Promise<string[]> {
  const { rows } = await handle.db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename);
}

describe("on a Supabase-like database", () => {
  it("gives the Data API roles no privilege on any Base table", async () => {
    const tables = await baseTables();
    expect(tables).toEqual(
      expect.arrayContaining([
        "audit_log",
        "domains",
        "entries",
        "memberships",
        "sites",
        "users",
        "versions",
      ]),
    );
    for (const role of API_ROLES) {
      for (const table of tables) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          const { rows } = await handle.db.execute<{ allowed: boolean }>(
            sql`SELECT has_table_privilege(${role}, ${`public.${table}`}, ${privilege}) AS allowed`,
          );
          expect({ role, table, privilege, allowed: rows[0]?.allowed }).toMatchObject({
            allowed: false,
          });
        }
      }
    }
  });

  it("refuses the Data API roles outright", async () => {
    await createSite(handle.db, {
      name: "A",
      timeZone: "UTC",
      defaultLocale: "en",
      locales: ["en"],
    });
    for (const role of API_ROLES) {
      await expect(
        handle.db.transaction(async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
          await tx.execute(sql`SELECT * FROM sites`);
        }),
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
    }
  });

  it("returns no rows even if a privilege is granted later by mistake", async () => {
    const site = await createSite(handle.db, {
      name: "B",
      timeZone: "UTC",
      defaultLocale: "en",
      locales: ["en"],
    });
    await addDomain(handle.db, site.id, { host: "b.example" });
    await findOrCreateUser(handle.db, { authId: "auth_b", email: "b@example.com", name: null });
    for (const table of [
      "sites",
      "domains",
      "users",
      "entries",
      "memberships",
      "versions",
      "audit_log",
    ]) {
      await handle.db.execute(sql.raw(`GRANT SELECT ON ${table} TO anon`));
      const rows = await handle.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE anon`);
        const { rows } = await tx.execute<{ n: number }>(
          sql.raw(`SELECT count(*)::int AS n FROM ${table}`),
        );
        return rows[0]?.n;
      });
      await handle.db.execute(sql.raw(`REVOKE SELECT ON ${table} FROM anon`));
      expect({ table, rows }).toEqual({ table, rows: 0 });
    }
  });
});

describe("cms_app on the newly secured tables", () => {
  it("sees only its own site and domains inside withSite", async () => {
    const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };
    const a = await createSite(handle.db, { ...base, name: "Scope A" });
    const b = await createSite(handle.db, { ...base, name: "Scope B" });
    await addDomain(handle.db, a.id, { host: "scope-a.example" });
    await addDomain(handle.db, b.id, { host: "scope-b.example" });
    const seen = await withSite(handle.db, a.id, async (tx) => {
      const sites = await tx.execute<{ id: string }>(sql`SELECT id FROM sites`);
      const domains = await tx.execute<{ host: string }>(sql`SELECT host FROM domains`);
      return { sites: sites.rows.map((r) => r.id), hosts: domains.rows.map((r) => r.host) };
    });
    expect(seen).toEqual({ sites: [a.id], hosts: ["scope-a.example"] });
    // It may lock its own site row but never change it.
    await expect(
      withSite(handle.db, a.id, (tx) =>
        tx.execute(sql`UPDATE sites SET name = 'x' WHERE id = ${a.id}`),
      ),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });

  it("sees the user's member sites and the user row inside withUser", async () => {
    const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };
    const mine = await createSite(handle.db, { ...base, name: "Mine" });
    await createSite(handle.db, { ...base, name: "Not mine" });
    const user = await findOrCreateUser(handle.db, {
      authId: "auth_member",
      email: "member@example.com",
      name: null,
    });
    await findOrCreateUser(handle.db, { authId: "auth_other", email: "o@example.com", name: null });
    await withSite(handle.db, mine.id, (tx) => setMembershipInTx(tx, mine.id, user.id, "editor"));
    const seen = await withUser(handle.db, user.id, async (tx) => {
      const sites = await tx.execute<{ name: string }>(sql`SELECT name FROM sites`);
      const users = await tx.execute<{ id: string }>(sql`SELECT id FROM users`);
      return { sites: sites.rows.map((r) => r.name), users: users.rows.map((r) => r.id) };
    });
    expect(seen).toEqual({ sites: ["Mine"], users: [user.id] });
  });
});
