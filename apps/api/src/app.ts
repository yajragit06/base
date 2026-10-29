import { type ApiDeps, handleApi } from "@cms/http";
import Fastify, { type FastifyServerOptions } from "fastify";

/**
 * The Scale pack's API host: Fastify serves the same `@cms/http` handlers as the Next.js
 * app, without listening, so tests can use `app.inject`.
 */
export function buildApp(deps: ApiDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);
  // No route reads a body yet, so leave bodies unparsed: every request reaches handleApi,
  // which answers the same as on the Next.js host.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_request, _payload, done) => done(null));

  app.all("/api/*", async (request, reply) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) for (const v of value) headers.append(name, v);
      else if (value !== undefined) headers.set(name, value);
    }
    const response = await handleApi(
      new Request(new URL(request.url, "http://localhost"), { method: request.method, headers }),
      deps,
    );
    reply.code(response.status);
    response.headers.forEach((value, name) => {
      reply.header(name, value);
    });
    return reply.send(await response.text());
  });

  return app;
}
