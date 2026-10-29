import { createSite, findOrCreateUser, setMembershipInTx, withSite } from "@cms/db";
import { describe, expect, it } from "vitest";
import type { AuthAdapter } from "./auth.js";
import { useTestDb } from "./test/db.js";
import { fakeAuth } from "./test/fake-auth.js";
import { injector } from "./test/inject.js";

const { db } = useTestDb();
const auth = fakeAuth({
  "token-ada": { authId: "user_ada", email: "ada@example.com", name: "Ada" },
});
const inject = injector({ db, auth: auth.adapter });
const bearer = { authorization: "Bearer token-ada" };

describe("handleApi", () => {
  it("answers 404 for an unknown path, inside or outside /api", async () => {
    for (const url of ["/api/nope", "/api/me/extra", "/api/me/", "/api", "/me", "/api/sites/x"]) {
      const res = await inject({ method: "GET", url, headers: bearer });
      expect(res.statusCode, url).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    }
  });

  it("answers 404 for a site id that does not decode", async () => {
    const res = await inject({ method: "GET", url: "/api/sites/%E0/tree", headers: bearer });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("answers 405 with Allow for another method on a known path", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await inject({ method, url: "/api/me", headers: bearer });
      expect(res.statusCode).toBe(405);
      expect(res.headers.get("allow")).toBe("GET");
      expect(res.json()).toEqual({ error: "method_not_allowed" });
    }
  });

  it("answers 500 without the message and hands the error to onError", async () => {
    const errors: unknown[] = [];
    const broken: AuthAdapter = {
      verify: async () => {
        throw new Error("secret detail");
      },
      getProfile: async () => {
        throw new Error("unused");
      },
    };
    const res = await injector({ db, auth: broken, onError: (e) => errors.push(e) })({
      method: "GET",
      url: "/api/me",
      headers: bearer,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error" });
    expect(errors).toEqual([new Error("secret detail")]);
  });

  it("rejects a repeated or prototype-named query parameter as invalid input", async () => {
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
    const ok = await inject({
      method: "GET",
      url: `/api/sites/${site.id}/tree?limit=5`,
      headers: bearer,
    });
    expect(ok.statusCode).toBe(200);
    const res = await inject({
      method: "GET",
      url: `/api/sites/${site.id}/tree?limit=5&limit=6`,
      headers: bearer,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_input" });
    for (const q of ["__proto__=x", "__proto__=x&__proto__=y", "constructor=x"]) {
      const bad = await inject({
        method: "GET",
        url: `/api/sites/${site.id}/tree?${q}`,
        headers: bearer,
      });
      expect(bad.statusCode, q).toBe(400);
      expect(bad.json()).toEqual({ error: "invalid_input" });
    }
  });

  it("marks every answer JSON and not cacheable", async () => {
    for (const [url, headers] of [
      ["/api/healthz", {}],
      ["/api/me", {}],
      ["/api/me", bearer],
      ["/api/nope", {}],
    ] as const) {
      const res = await inject({ method: "GET", url, headers });
      expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});
