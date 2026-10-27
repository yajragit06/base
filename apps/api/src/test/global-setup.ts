import { createDb, runMigrations } from "@cms/db";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  const { db, pool } = createDb(url);
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
