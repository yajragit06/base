import { createDb } from "@cms/db";
import { type ApiDeps, clerkAuthAdapter, clerkCalls } from "@cms/http";

/** Reads a required setting, naming it (never its value) when it is missing. */
export function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

let deps: ApiDeps | undefined;

/**
 * The API's database and auth adapter, built once per server instance on first use, so
 * `next build` needs no environment. The small pool keeps each serverless instance from
 * taking a large share of the database's connections.
 */
export function serverDeps(): ApiDeps {
  if (!deps) {
    const { db } = createDb(requireEnv(process.env, "DATABASE_URL"), { max: 5 });
    deps = {
      db,
      auth: clerkAuthAdapter(clerkCalls(requireEnv(process.env, "CLERK_SECRET_KEY"))),
    };
  }
  return deps;
}
