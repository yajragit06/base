import { DbError, listChildrenPage } from "@cms/db";
import { z } from "zod";
import { requireSiteMember, requireUser } from "../auth.js";
import { json } from "../json.js";
import type { RouteContext } from "../router.js";

const query = z.strictObject({
  parentId: z.string().optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** The page tree: one page of a node's children (or the top level), for any role on the site. */
export async function getTree({
  request,
  deps,
  params,
  query: raw,
}: RouteContext): Promise<Response> {
  const user = await requireUser(deps.db, deps.auth, request);
  if (user instanceof Response) return user;
  const siteId = params.siteId ?? "";
  const membership = await requireSiteMember(deps.db, siteId, user);
  if (membership instanceof Response) return membership;
  const parsed = raw === null ? null : query.safeParse(raw);
  if (!parsed?.success) return json(400, { error: "invalid_input" });
  const { parentId, after, limit } = parsed.data;
  try {
    return json(200, await listChildrenPage(deps.db, siteId, parentId ?? null, { after, limit }));
  } catch (error) {
    if (error instanceof DbError && error.code === "invalid_cursor") {
      return json(400, { error: "invalid_cursor" });
    }
    if (error instanceof DbError && error.code === "parent_not_found") {
      return json(404, { error: "parent_not_found" });
    }
    throw error;
  }
}
