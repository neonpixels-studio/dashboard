import { clerkMiddleware } from "@clerk/nuxt/server";
import { getOrCreateUser } from "../utils/auth";

// @nuxt/nitro-server's own error handler renders the custom error page by
// internally re-fetching this exact path, replaying the original request's
// cookies through this same middleware (see its error.mjs handler). Without
// this guard, a signups-disabled 403 (or any error getOrCreateUser throws)
// fires again on that internal request before the renderer runs, and the
// user sees Nitro's generic fallback page instead of app/error.vue. Matched
// on the request path (not the "x-nuxt-error" header Nitro also sets on it)
// since a path is not something an ordinary caller can spoof into skipping
// auth, whereas an arbitrary request header is. Assumes the default
// app.baseURL ("/"); prefix this with the base if that's ever configured.
const NUXT_ERROR_RENDER_PATH = "/__nuxt_error";

// Registered manually (nuxt.config sets `clerk.skipServerMiddleware: true`) so
// every authenticated request also resolves the matching database row onto
// `event.context.user`. Unauthenticated requests pass through with no user —
// route handlers gate themselves with requireUser().
export default clerkMiddleware(async (event) => {
  if (event.path.startsWith(NUXT_ERROR_RENDER_PATH)) {
    return;
  }

  const { userId } = event.context.auth();
  if (!userId) {
    return;
  }
  event.context.user = await getOrCreateUser(userId);
});
