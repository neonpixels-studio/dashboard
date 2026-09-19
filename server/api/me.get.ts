import { requireUser } from "../utils/auth";

// Smallest route that exercises the full chain: Clerk verifies the session in
// server/middleware/auth.ts, which resolves the matching Drizzle row onto the
// event context. Copy this shape for authenticated endpoints.
export default defineEventHandler((event) => {
  const user = requireUser(event);

  return {
    id: user.id,
    createdAt: user.createdAt,
  };
});
