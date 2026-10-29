import { createDb, truncateAllTables } from "@cms/db";
import { afterAll, beforeEach } from "vitest";

/** A database handle for one test file, emptied before each test. */
export function useTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  const handle = createDb(url);
  beforeEach(() => truncateAllTables(handle.pool));
  afterAll(() => handle.pool.end());
  return handle;
}
