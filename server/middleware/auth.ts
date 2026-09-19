import { clerkMiddleware } from "@clerk/nuxt/server";
import { getOrCreateUser } from "../utils/auth";

// Registered manually (nuxt.config sets `clerk.skipServerMiddleware: true`) so
// every authenticated request also resolves the matching database row onto
// `event.context.user`. Unauthenticated requests pass through with no user —
// route handlers gate themselves with requireUser().
export default clerkMiddleware(async (event) => {
  const { userId } = event.context.auth();
  if (!userId) {
    return;
  }
  event.context.user = await getOrCreateUser(userId);
});
