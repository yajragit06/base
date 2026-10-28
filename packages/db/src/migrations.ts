import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import type { Db } from "./index.js";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export function runMigrations(db: Db): Promise<void> {
  return migrate(db, { migrationsFolder });
}

/** Empties every table in `public`. Only for disposable test databases. */
export async function truncateAllTables(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
