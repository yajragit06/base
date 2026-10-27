import type { Db } from "@cms/db";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { AuthAdapter } from "./auth.js";
import { meRoutes } from "./routes/me.js";
import { treeRoutes } from "./routes/tree.js";

export interface AppDeps {
  db: Db;
  auth: AuthAdapter;
}

/** Builds the API without listening, so tests can use `app.inject`. */
export function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);
  app.decorateRequest("user", null);
  app.decorateRequest("membership", null);

  app.get("/healthz", async () => ({ ok: true }));
  meRoutes(app, deps.db, deps.auth);
  treeRoutes(app, deps.db, deps.auth);

  return app;
}
