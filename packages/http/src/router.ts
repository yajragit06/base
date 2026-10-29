import type { Db } from "@cms/db";
import type { AuthAdapter } from "./auth.js";
import { json } from "./json.js";
import { getMe } from "./routes/me.js";
import { getTree } from "./routes/tree.js";

export interface ApiDeps {
  db: Db;
  auth: AuthAdapter;
  /** Receives unexpected errors; the response never includes them. Defaults to console.error. */
  onError?: (error: unknown) => void;
}

export interface RouteContext {
  request: Request;
  deps: ApiDeps;
  /** Decoded path parameters, such as `siteId`. */
  params: Record<string, string>;
  /** The query string as an object, or null when a key repeats. */
  query: Record<string, string> | null;
}

type Handler = (ctx: RouteContext) => Promise<Response>;

/** Paths as segments after `/api`; `:name` segments are parameters. */
const routes: { path: string[]; methods: Record<string, Handler> }[] = [
  { path: ["healthz"], methods: { GET: async () => json(200, { ok: true }) } },
  { path: ["me"], methods: { GET: getMe } },
  { path: ["sites", ":siteId", "tree"], methods: { GET: getTree } },
];

const notFound = () => json(404, { error: "not_found" });

function match(segments: string[]) {
  for (const route of routes) {
    if (route.path.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (const [i, part] of route.path.entries()) {
      const segment = segments[i] ?? "";
      if (part.startsWith(":")) {
        let value: string;
        try {
          value = decodeURIComponent(segment);
        } catch {
          return "bad_param" as const;
        }
        params[part.slice(1)] = value;
      } else if (part !== segment) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

function queryObject(url: URL): Record<string, string> | null {
  // No prototype, so `__proto__` is an ordinary key that the strict schemas reject.
  const query: Record<string, string> = Object.create(null);
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(query, key)) return null;
    query[key] = value;
  }
  return query;
}

/**
 * The Base API, written once against web-standard Request and Response. Next.js route
 * handlers, the admin's server components and the Fastify host all call this.
 */
export async function handleApi(request: Request, deps: ApiDeps): Promise<Response> {
  try {
    const url = new URL(request.url);
    const [first, ...rest] = url.pathname.split("/").slice(1);
    if (first !== "api") return notFound();
    const found = match(rest);
    if (found === null || found === "bad_param") return notFound();
    const handler = found.route.methods[request.method];
    if (!handler) {
      return json(
        405,
        { error: "method_not_allowed" },
        { allow: Object.keys(found.route.methods).join(", ") },
      );
    }
    return await handler({ request, deps, params: found.params, query: queryObject(url) });
  } catch (error) {
    (deps.onError ?? console.error)(error);
    return json(500, { error: "internal_error" });
  }
}
