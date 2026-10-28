import { formatChecks, runDoctor } from "./doctor.js";
import { createDb } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const { db, pool } = createDb(url);
try {
  const checks = await runDoctor(db);
  console.log(formatChecks(checks));
  process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
} catch (error) {
  // Drizzle wraps the driver error; its cause says why (wrong password, unknown host,
  // certificate). Neither message contains the password or the full URL.
  const cause = (error as { cause?: { message?: string } }).cause;
  console.error(`Could not run the checks: ${cause?.message ?? (error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
