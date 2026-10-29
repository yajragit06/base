import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isAdmin = createRouteMatcher(["/admin(.*)"]);
const isSignIn = createRouteMatcher(["/admin/sign-in(.*)"]);

// Admin pages need a signed-in person; signed-out visits go to /admin/sign-in. API routes
// check their own bearer token and answer 401 as JSON, so the proxy leaves them alone.
export default clerkMiddleware(async (auth, request) => {
  if (isAdmin(request) && !isSignIn(request)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
