import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

// drizzle's migrator throws when no migration has been generated yet.
if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  console.log("No migrations yet.");
} else {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}
