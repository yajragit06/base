import { type ApiDeps, handleApi } from "../router.js";

export interface InjectResult {
  statusCode: number;
  headers: Headers;
  // biome-ignore lint/suspicious/noExplicitAny: test bodies are asserted field by field.
  json(): any;
}

/** Calls `handleApi` the way a host would, with an `app.inject`-like shape for tests. */
export function injector(deps: ApiDeps) {
  return async function inject(opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
  }): Promise<InjectResult> {
    const res = await handleApi(
      new Request(new URL(opts.url, "http://localhost"), {
        method: opts.method,
        headers: opts.headers,
      }),
      deps,
    );
    const text = await res.text();
    return { statusCode: res.status, headers: res.headers, json: () => JSON.parse(text) };
  };
}
