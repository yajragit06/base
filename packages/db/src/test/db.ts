import { afterAll, beforeEach } from "vitest";
import { createDb } from "../index.js";
import { truncateAllTables } from "../migrations.js";

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
  beforeEach(() => truncateAllTables(handle.pool));
  afterAll(() => handle.pool.end());
  return handle;
}
