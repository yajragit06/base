import { type Db, DbError, listChildrenPage } from "@cms/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type AuthAdapter, requireSiteMember, requireUser } from "../auth.js";

const query = z.strictObject({
  parentId: z.string().optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** The page tree: one page of a node's children (or the top level), for any role on the site. */
export function treeRoutes(app: FastifyInstance, db: Db, auth: AuthAdapter) {
  app.get(
    "/sites/:siteId/tree",
    { preHandler: [requireUser(db, auth), requireSiteMember(db)] },
    async (request, reply) => {
      const { siteId } = request.params as { siteId: string };
      const parsed = query.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
      const { parentId, after, limit } = parsed.data;
      try {
        return await listChildrenPage(db, siteId, parentId ?? null, { after, limit });
      } catch (error) {
        if (error instanceof DbError && error.code === "invalid_cursor") {
          return reply.code(400).send({ error: "invalid_cursor" });
        }
        if (error instanceof DbError && error.code === "parent_not_found") {
          return reply.code(404).send({ error: "parent_not_found" });
        }
        throw error;
      }
    },
  );
}
