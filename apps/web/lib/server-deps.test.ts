import { afterEach, describe, expect, it, vi } from "vitest";
import { requireEnv, serverDeps } from "./server-deps";

afterEach(() => vi.unstubAllEnvs());

describe("server deps", () => {
  it("names a missing setting without printing any value", () => {
    expect(() => requireEnv({ OTHER: "secret" }, "DATABASE_URL")).toThrow(
      "DATABASE_URL is not set.",
    );
    expect(requireEnv({ DATABASE_URL: "postgres://x" }, "DATABASE_URL")).toBe("postgres://x");
  });

  it("refuses to build without DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
    expect(() => serverDeps()).toThrow("DATABASE_URL is not set.");
  });
});
