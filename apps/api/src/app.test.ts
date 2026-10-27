import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("GET /healthz", () => {
  const app = buildApp();
  afterAll(() => app.close());

  it("reports the API is up", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
