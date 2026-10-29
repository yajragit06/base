"use server";

import { ApiError, apiGet, type TreePage } from "@/lib/api";

export type LoadResult = { ok: true; page: TreePage } | { ok: false; status: number };

/** One page of a node's children (or the top level) for the tree, as the signed-in person. */
export async function loadChildren(
  siteId: string,
  parentId: string | null,
  after: string | null,
): Promise<LoadResult> {
  const params = new URLSearchParams();
  if (parentId !== null) params.set("parentId", parentId);
  if (after !== null) params.set("after", after);
  const query = params.size > 0 ? `?${params}` : "";
  try {
    const page = await apiGet<TreePage>(`/api/sites/${encodeURIComponent(siteId)}/tree${query}`);
    return { ok: true, page };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, status: error.status };
    throw error;
  }
}
