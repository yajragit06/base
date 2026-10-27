import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../index.js";
import { testDatabaseUrl } from "./db.js";

export default async function setup() {
  const { db, pool } = createDb(testDatabaseUrl());
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
