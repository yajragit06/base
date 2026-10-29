import { type ApiDeps, handleApi } from "@cms/http";

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
 * Calls the API in-process as the person holding `token`: the same handlers and checks
 * as `/api` over HTTP, without a network hop.
 */
export async function callApi<T>(deps: ApiDeps, token: string, path: string): Promise<T> {
  const res = await handleApi(
    new Request(new URL(path, "http://base.internal"), {
      headers: { authorization: `Bearer ${token}` },
    }),
    deps,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error);
  }
  return (await res.json()) as T;
}
