import { handleApi } from "@cms/http";
import { serverDeps } from "@/lib/server-deps";

// The Base API at /api, served by the shared @cms/http handlers.
const handler = (request: Request) => handleApi(request, serverDeps());

// Every method, including OPTIONS and HEAD, which Next.js would otherwise answer itself.
export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
