import { createDb } from "../index.js";
import { runMigrations } from "../migrations.js";
import { testDatabaseUrl } from "./db.js";

export default async function setup() {
  const { db, pool } = createDb(testDatabaseUrl());
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
