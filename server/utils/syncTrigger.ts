import { timingSafeEqual } from "node:crypto";
import type { H3Event } from "h3";
import { getHeader } from "h3";

// A service-to-service credential, not a Clerk session — server/middleware/
// auth.ts's clerkMiddleware only ever attaches event.context.user, it never
// blocks an unauthenticated request, so /api/sync (POST /api/sync.post.ts)
// gates itself the same way requireUser() gates a Clerk-authenticated route.
// RFC 7235 auth schemes are case-insensitive, so a sibling app or proxy that
// sends "bearer <secret>" must still be accepted. The token itself is
// captured as \S+ (not .+) so trailing whitespace a client appends after the
// token isn't folded into the presented secret, which would otherwise fail
// the length check in secretsMatch below for an otherwise-correct secret.
const BEARER_HEADER_PATTERN = /^Bearer\s+(\S+)\s*$/i;

function readPresentedSecret(event: H3Event): string | null {
  const header = getHeader(event, "authorization");
  const match = header?.match(BEARER_HEADER_PATTERN);
  return match?.[1] ?? null;
}

// Same-length comparison via timingSafeEqual so a wrong guess can't be
// narrowed down one byte at a time from response timing. Buffers must be
// equal length for timingSafeEqual to run at all, so the length check short
// circuits that case first rather than throwing.
function secretsMatch(presented: string, configured: string): boolean {
  const presentedBuffer = Buffer.from(presented);
  const configuredBuffer = Buffer.from(configured);
  if (presentedBuffer.length !== configuredBuffer.length) {
    return false;
  }
  return timingSafeEqual(presentedBuffer, configuredBuffer);
}

/**
 * Guards the manual/scheduled sync trigger (POST /api/sync). Callers are
 * sibling apps and this repo's own Netlify scheduled function
 * (netlify/functions/scheduled-sync.ts), never a browser session, so this
 * checks a shared secret (`NUXT_SYNC_TRIGGER_SECRET`) instead of Clerk auth.
 *
 * An unset configured secret fails closed (every request rejected) rather
 * than open — an empty `NUXT_SYNC_TRIGGER_SECRET` must never be read as
 * "no auth required."
 */
export function requireSyncTriggerSecret(event: H3Event): void {
  const configuredSecret = useRuntimeConfig().syncTriggerSecret;
  const presentedSecret = readPresentedSecret(event);
  const isAuthorized =
    !!configuredSecret &&
    !!presentedSecret &&
    secretsMatch(presentedSecret, configuredSecret);

  if (!isAuthorized) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
}
