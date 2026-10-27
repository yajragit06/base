import Fastify, { type FastifyServerOptions } from "fastify";

/** Builds the API without listening, so tests can use `app.inject`. */
export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}
