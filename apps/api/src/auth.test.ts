import { describe, expect, it } from "vitest";
import { type ClerkCalls, clerkAuthAdapter, UnverifiedEmailError } from "./auth.js";

function stubClerk(overrides: Partial<ClerkCalls> = {}): ClerkCalls {
  return {
    async verifyToken(token) {
      if (token !== "good") throw new Error("invalid signature");
      return { sub: "user_123" };
    },
    async getUser() {
      return {
        primaryEmailAddress: {
          emailAddress: "Ada@Example.com",
          verification: { status: "verified" },
        },
        fullName: "Ada Lovelace",
      };
    },
    ...overrides,
  };
}

describe("clerkAuthAdapter", () => {
  it("returns the subject of a verified token and null for anything Clerk rejects", async () => {
    const adapter = clerkAuthAdapter(stubClerk());
    expect(await adapter.verify("good")).toBe("user_123");
    expect(await adapter.verify("forged")).toBeNull();
  });

  it("treats a token without a subject as invalid", async () => {
    const adapter = clerkAuthAdapter(stubClerk({ verifyToken: async () => ({}) }));
    expect(await adapter.verify("good")).toBeNull();
  });

  it("maps the Clerk user to our profile and requires a primary email", async () => {
    expect(await clerkAuthAdapter(stubClerk()).getProfile("user_123")).toEqual({
      email: "Ada@Example.com",
      name: "Ada Lovelace",
    });
    const noEmail = clerkAuthAdapter(
      stubClerk({ getUser: async () => ({ primaryEmailAddress: null, fullName: null }) }),
    );
    await expect(noEmail.getProfile("user_123")).rejects.toThrow("no primary email");
  });

  it("refuses a primary email Clerk has not verified, or has no verification for", async () => {
    for (const verification of [{ status: "unverified" }, { status: "expired" }, null]) {
      const adapter = clerkAuthAdapter(
        stubClerk({
          getUser: async () => ({
            primaryEmailAddress: { emailAddress: "ada@example.com", verification },
            fullName: null,
          }),
        }),
      );
      await expect(adapter.getProfile("user_123")).rejects.toBeInstanceOf(UnverifiedEmailError);
    }
  });
});
