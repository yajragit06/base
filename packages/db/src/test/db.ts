import { afterAll, beforeEach } from "vitest";
import { createDb } from "../index.js";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a disposable database: tests truncate every table.",
    );
  }
  return url;
}

/** A database handle for one test file, emptied before each test. */
export function useTestDb() {
  const handle = createDb(testDatabaseUrl());

  beforeEach(async () => {
    const { rows } = await handle.pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
      await handle.pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
  });

  afterAll(() => handle.pool.end());

  return handle;
}
