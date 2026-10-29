import { createSite, findOrCreateUser, setMembershipInTx, withSite } from "@cms/db";
import { handleApi } from "@cms/http";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { useTestDb } from "./test/db.js";

const { db } = useTestDb();
// Tokens map straight to auth ids; only Ada exists.
const auth = {
  verify: async (token: string) => (token === "token-ada" ? "user_ada" : null),
  getProfile: async () => ({ email: "ada@example.com", name: "Ada" }),
};
const app = buildApp({ db, auth });
afterAll(() => app.close());
const bearer = { authorization: "Bearer token-ada" };

describe("Fastify host", () => {
  it("serves the shared health check and auth answers", async () => {
    const health = await app.inject({ method: "GET", url: "/api/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });
    expect(health.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(health.headers["cache-control"]).toBe("no-store");

    const anonymous = await app.inject({ method: "GET", url: "/api/me" });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: "unauthenticated" });

    const me = await app.inject({ method: "GET", url: "/api/me", headers: bearer });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ email: "ada@example.com", name: "Ada" });
  });

  it("forwards the path and query string, answering as handleApi does", async () => {
    const site = await createSite(db, {
      name: "A",
      timeZone: "UTC",
      defaultLocale: "en",
      locales: ["en"],
    });
    const ada = await findOrCreateUser(db, {
      authId: "user_ada",
      email: "ada@example.com",
      name: null,
    });
    await withSite(db, site.id, (tx) => setMembershipInTx(tx, site.id, ada.id, "viewer"));
    for (const query of ["limit=1", "limit=0", "limit=1&limit=2"]) {
      const url = `/api/sites/${site.id}/tree?${query}`;
      const viaFastify = await app.inject({ method: "GET", url, headers: bearer });
      const direct = await handleApi(new Request(`http://localhost${url}`, { headers: bearer }), {
        db,
        auth,
      });
      expect(viaFastify.statusCode, query).toBe(direct.status);
      expect(viaFastify.json()).toEqual(await direct.json());
    }
  });

  it("passes 404 and 405 through", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "not_found" });
    const wrong = await app.inject({ method: "POST", url: "/api/me", headers: bearer });
    expect(wrong.statusCode).toBe(405);
    expect(wrong.headers.allow).toBe("GET");
    // Bodies are not parsed, so any body still gets handleApi's 405.
    for (const [type, payload] of [
      ["application/json", "{not json"],
      ["application/xml", "<a/>"],
    ]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/healthz",
        headers: { "content-type": type },
        payload,
      });
      expect(res.statusCode, type).toBe(405);
      expect(res.json()).toEqual({ error: "method_not_allowed" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });
});
