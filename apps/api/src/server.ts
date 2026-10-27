import { createDb } from "@cms/db";
import { buildApp } from "./app.js";
import { clerkAuthAdapter, clerkCalls } from "./auth.js";

const databaseUrl = process.env.DATABASE_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
if (!clerkSecretKey)
  throw new Error("CLERK_SECRET_KEY is not set; the API cannot verify sign-ins.");

const { db, pool } = createDb(databaseUrl);
const app = buildApp({ db, auth: clerkAuthAdapter(clerkCalls(clerkSecretKey)) }, { logger: true });
const port = Number(process.env.PORT ?? 4000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}

await app.listen({ host: "0.0.0.0", port });
