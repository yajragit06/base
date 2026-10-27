import "server-only";
import { auth } from "@clerk/nextjs/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** A non-2xx answer from the API, with its status and stable error code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined) {
    super(`API answered ${status}${code ? ` (${code})` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Calls the API as the signed-in person: the Clerk session token goes in the
 * Authorization header and never reaches client JavaScript.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const token = await (await auth()).getToken();
  if (!token) throw new ApiError(401, "unauthenticated");
  const res = await fetch(`${API_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error);
  }
  return (await res.json()) as T;
}

export interface Me {
  user: { id: string; email: string; name: string | null };
  memberships: { siteId: string; siteName: string; role: string }[];
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
