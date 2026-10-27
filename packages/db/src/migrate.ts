import { createDb } from "./index.js";
import { runMigrations } from "./migrations.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { db, pool } = createDb(url);
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
