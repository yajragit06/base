import "server-only";
import { auth } from "@clerk/nextjs/server";
import { ApiError, callApi } from "./api-core";
import { serverDeps } from "./server-deps";

export { ApiError } from "./api-core";

/**
 * Calls the API as the signed-in person, in-process: the Clerk session token goes in the
 * Authorization header and never reaches client JavaScript.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const token = await (await auth()).getToken();
  if (!token) throw new ApiError(401, "unauthenticated");
  return callApi<T>(serverDeps(), token, path);
}

export interface Me {
  user: { id: string; email: string; name: string | null };
  memberships: { siteId: string; siteName: string; role: string }[];
}

/**
 * The signed-in person and their sites, or `"email_not_verified"` when the identity
 * provider has not verified their email yet. Other failures throw (see `app/error.tsx`).
 */
export async function getMe(): Promise<Me | "email_not_verified"> {
  try {
    return await apiGet<Me>("/api/me");
  } catch (error) {
    if (error instanceof ApiError && error.code === "email_not_verified") {
      return "email_not_verified";
    }
    throw error;
  }
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  slug: string;
  uri: string;
  typeKey: string;
  sortOrder: number;
  hasChildren: boolean;
}

export interface TreePage {
  items: TreeNode[];
  nextCursor: string | null;
}
