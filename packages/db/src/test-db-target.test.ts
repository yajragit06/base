import { describe, expect, it } from "vitest";
import { testDbTarget } from "./test-db-target.js";

const admin = "postgres://cms:SuperSecret123@localhost:5432/cms";
const test = "postgres://cms:SuperSecret123@localhost:5432/cms_test";

describe("testDbTarget", () => {
  it.each([
    ["DATABASE_URL", "postgres://cms:SuperSecret123@[bad/cms", test],
    ["TEST_DATABASE_URL", admin, "postgres://cms:SuperSecret123@[bad/cms_test"],
    ["an undecodable name", admin, "postgres://cms:SuperSecret123@localhost:5432/%E0"],
  ])("refuses a malformed %s without echoing it", (_, a, t) => {
    const result = testDbTarget(a, t);
    expect(result).toEqual({
      ok: false,
      error: "DATABASE_URL or TEST_DATABASE_URL is not a valid URL.",
    });
    expect(JSON.stringify(result)).not.toContain("SuperSecret123");
  });

  it.each([
    ["no database name", "postgres://cms:SuperSecret123@localhost:5432/"],
    ["the same database", admin],
  ])("refuses %s", (_, t) => {
    expect(testDbTarget(admin, t)).toEqual({
      ok: false,
      error: "TEST_DATABASE_URL must name a separate database.",
    });
  });

  it.each([
    ["another host", "postgres://cms:SuperSecret123@db.example.com:5432/cms_test"],
    ["another port", "postgres://cms:SuperSecret123@localhost:5433/cms_test"],
  ])("refuses %s", (_, t) => {
    expect(testDbTarget(admin, t)).toEqual({
      ok: false,
      error: "DATABASE_URL and TEST_DATABASE_URL must point at the same server.",
    });
  });

  it("returns the name and the host only for the same server", () => {
    const result = testDbTarget(admin, test);
    expect(result).toEqual({ ok: true, name: "cms_test", server: "localhost:5432" });
    expect(JSON.stringify(result)).not.toContain("SuperSecret123");
  });
});
