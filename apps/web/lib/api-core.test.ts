import type { Db } from "@cms/db";
import type { AuthAdapter } from "@cms/http";
import { describe, expect, it } from "vitest";
import { ApiError, callApi } from "./api-core";

// Neither path below reaches the database.
const db = {} as Db;
const auth: AuthAdapter = {
  verify: async () => null,
  getProfile: async () => {
    throw new Error("unused");
  },
};

describe("callApi", () => {
  it("returns the handler's JSON", async () => {
    expect(await callApi({ db, auth }, "token", "/api/healthz")).toEqual({ ok: true });
  });

  it("maps a non-2xx answer to ApiError with its status and code", async () => {
    const seen: string[] = [];
    const spy: AuthAdapter = {
      ...auth,
      verify: async (token) => {
        seen.push(token);
        return null;
      },
    };
    const error = await callApi({ db, auth: spy }, "abc.def", "/api/me").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "unauthenticated" });
    expect(seen).toEqual(["abc.def"]);
    await expect(callApi({ db, auth }, "t", "/api/nope")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });
});
