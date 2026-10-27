import { createClerkClient, verifyToken } from "@clerk/backend";
import { type Db, findOrCreateUser, findUserByAuthId, type User } from "@cms/db";
import type { FastifyReply, FastifyRequest } from "fastify";

/** The provider has not verified the person's email, so we will not trust it. */
export class UnverifiedEmailError extends Error {
  constructor(authId: string) {
    super(`The primary email of ${authId} is not verified.`);
    this.name = "UnverifiedEmailError";
  }
}

export interface Profile {
  email: string;
  name: string | null;
}

/** Proves who a person is. Swappable: Clerk today, another provider for self-hosters. */
export interface AuthAdapter {
  /** The provider's stable subject id for a valid session token, else null. Never throws for bad tokens. */
  verify(token: string): Promise<string | null>;
  /**
   * The person's current profile; only called the first time we see them. Throws
   * `UnverifiedEmailError` when the provider has not verified their email.
   */
  getProfile(authId: string): Promise<Profile>;
}

/** The two Clerk calls the adapter needs, injectable so tests need no Clerk account. */
export interface ClerkCalls {
  verifyToken(token: string): Promise<{ sub?: string }>;
  getUser(userId: string): Promise<{
    primaryEmailAddress: {
      emailAddress: string;
      verification: { status: string } | null;
    } | null;
    fullName: string | null;
  }>;
}

export function clerkCalls(secretKey: string): ClerkCalls {
  const client = createClerkClient({ secretKey });
  return {
    verifyToken: (token) => verifyToken(token, { secretKey }),
    getUser: (userId) => client.users.getUser(userId),
  };
}

export function clerkAuthAdapter(clerk: ClerkCalls): AuthAdapter {
  return {
    async verify(token) {
      try {
        const payload = await clerk.verifyToken(token);
        return typeof payload.sub === "string" && payload.sub !== "" ? payload.sub : null;
      } catch {
        return null;
      }
    },
    async getProfile(authId) {
      const user = await clerk.getUser(authId);
      const primary = user.primaryEmailAddress;
      if (!primary?.emailAddress) {
        throw new Error(`Clerk user ${authId} has no primary email address.`);
      }
      // The email is how the Owner bootstrap finds a person, so only a verified one counts.
      if (primary.verification?.status !== "verified") throw new UnverifiedEmailError(authId);
      return { email: primary.emailAddress, name: user.fullName };
    },
  };
}

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

/** A preHandler that sets `request.user` from the bearer token or replies 401. */
export function requireUser(db: Db, auth: AuthAdapter) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const match = BEARER.exec(request.headers.authorization ?? "");
    const authId = match?.[1] ? await auth.verify(match[1]) : null;
    if (!authId) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    const existing = await findUserByAuthId(db, authId);
    if (existing) {
      request.user = existing;
      return;
    }
    let profile: Profile;
    try {
      profile = await auth.getProfile(authId);
    } catch (error) {
      if (error instanceof UnverifiedEmailError) {
        return reply.code(403).send({ error: "email_not_verified" });
      }
      throw error;
    }
    request.user = await findOrCreateUser(db, { authId, ...profile });
  };
}
