import { defineConfig } from "vitest/config";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Point it at a disposable database: tests truncate every table.",
  );
}

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    // Test files share one database and truncate it, so they must not run in parallel.
    fileParallelism: false,
  },
});
