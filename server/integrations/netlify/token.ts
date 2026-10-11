import { readIntegrationEnv } from "../integrationEnv";

const NETLIFY_TOKEN_ENV = "NUXT_NETLIFY_TOKEN";

// Null when the token isn't configured. Shared by the provider (skip cleanly)
// and the detail API (render a "not configured" tile) so the two never
// disagree about what "configured" means.
export function readNetlifyToken(): string | null {
  return readIntegrationEnv(NETLIFY_TOKEN_ENV)?.trim() || null;
}
