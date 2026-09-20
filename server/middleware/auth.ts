import { clerkMiddleware } from "@clerk/nuxt/server";
import { getOrCreateUser } from "../utils/auth";

// Set by @nuxt/nitro-server's own error handler on the internal request it
// issues to render the custom error page (see its error.mjs handler). That
// internal request replays the original request's cookies through this same
// middleware, so without this guard a signups-disabled 403 (or any error
// getOrCreateUser throws) would fire again before the renderer runs, and the
// user would see Nitro's generic fallback page instead of app/error.vue.
const NUXT_ERROR_RENDER_HEADER = "x-nuxt-error";

// Registered manually (nuxt.config sets `clerk.skipServerMiddleware: true`) so
// every authenticated request also resolves the matching database row onto
// `event.context.user`. Unauthenticated requests pass through with no user —
// route handlers gate themselves with requireUser().
export default clerkMiddleware(async (event) => {
  // Read the raw Node header instead of h3's getRequestHeader(event, ...):
  // @clerk/nuxt bundles its own nested h3 dependency, so clerkMiddleware()'s
  // event type is structurally distinct from the top-level h3's H3Event and
  // fails to typecheck as an argument to it. Node always lowercases incoming
  // header names, and the constant above is already lowercase, so this reads
  // the same value getRequestHeader would.
  if (event.node.req.headers[NUXT_ERROR_RENDER_HEADER]) {
    return;
  }

  const { userId } = event.context.auth();
  if (!userId) {
    return;
  }
  event.context.user = await getOrCreateUser(userId);
});
