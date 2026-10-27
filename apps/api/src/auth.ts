import { createClerkClient, verifyToken } from "@clerk/backend";
import { type Db, findOrCreateUser, findUserByAuthId, type User } from "@cms/db";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface Profile {
  email: string;
  name: string | null;
}

/** Proves who a person is. Swappable: Clerk today, another provider for self-hosters. */
export interface AuthAdapter {
  /** The provider's stable subject id for a valid session token, else null. Never throws for bad tokens. */
  verify(token: string): Promise<string | null>;
  /** The person's current profile; only called the first time we see them. */
  getProfile(authId: string): Promise<Profile>;
}

/** The two Clerk calls the adapter needs, injectable so tests need no Clerk account. */
export interface ClerkCalls {
  verifyToken(token: string): Promise<{ sub?: string }>;
  getUser(userId: string): Promise<{
    primaryEmailAddress: { emailAddress: string } | null;
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
      const email = user.primaryEmailAddress?.emailAddress;
      if (!email) throw new Error(`Clerk user ${authId} has no primary email address.`);
      return { email, name: user.fullName };
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
    request.user =
      (await findUserByAuthId(db, authId)) ??
      (await findOrCreateUser(db, { authId, ...(await auth.getProfile(authId)) }));
  };
}
