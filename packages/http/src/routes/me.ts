import { listMembershipsForUser } from "@cms/db";
import { requireUser } from "../auth.js";
import { json } from "../json.js";
import type { RouteContext } from "../router.js";

/** The signed-in person and their own sites. */
export async function getMe({ request, deps }: RouteContext): Promise<Response> {
  const user = await requireUser(deps.db, deps.auth, request);
  if (user instanceof Response) return user;
  return json(200, {
    user: { id: user.id, email: user.email, name: user.name },
    memberships: await listMembershipsForUser(deps.db, user.id),
  });
}
