import dotenvx from "@dotenvx/dotenvx";

// Netlify Functions run as standalone Lambdas and never receive the
// dotenvx-decrypted values that `nuxt build` bakes into the app bundle.
// Decrypt the same committed .env.production here instead, so values like
// SENTRY_DSN and NUXT_SYNC_TRIGGER_SECRET live only in the dotenvx file rather
// than also being duplicated as Netlify environment variables. Requires
// DOTENV_PRIVATE_KEY_PRODUCTION in Netlify's Functions scope and the file
// bundled via netlify.toml's `[functions] included_files`. Same pattern as
// basin's netlify/functions/env.ts.
//
// Always .env.production: the only function here is a scheduled one, and
// Netlify only runs scheduled functions on the published production deploy.
const FUNCTIONS_ENV_FILE = ".env.production";

let loaded = false;

export function loadEnv(): void {
  if (loaded) {
    return;
  }
  // strict: a missing private key or unbundled file throws here instead of
  // injecting the raw `encrypted:...` ciphertext as each var's value, which
  // would surface later as a baffling invalid-DSN or 401 from /api/sync.
  dotenvx.config({ path: FUNCTIONS_ENV_FILE, strict: true });
  loaded = true;
}
