import { type Db, listMembershipsForUser } from "@cms/db";
import type { FastifyInstance } from "fastify";
import { type AuthAdapter, requireUser } from "../auth.js";

export function meRoutes(app: FastifyInstance, db: Db, auth: AuthAdapter) {
  app.get("/me", { preHandler: requireUser(db, auth) }, async (request) => {
    const user = request.user;
    if (!user) throw new Error("requireUser did not set a user.");
    return {
      user: { id: user.id, email: user.email, name: user.name },
      memberships: await listMembershipsForUser(db, user.id),
    };
  });
}
