import dotenvx from "@dotenvx/dotenvx";

// Netlify Functions run as standalone Lambdas and never receive the
// dotenvx-decrypted values that `nuxt build` bakes into the app bundle.
// Decrypt the same committed env file the deploy was built from instead, so
// values like SENTRY_DSN and NUXT_SYNC_TRIGGER_SECRET live only in the dotenvx
// file rather than also being duplicated as Netlify environment variables.
// Requires DOTENV_PRIVATE_KEY_PRODUCTION and DOTENV_PRIVATE_KEY_DEV in
// Netlify's Functions scope and both files bundled via netlify.toml's
// `[functions] included_files`. Same pattern as basin's
// netlify/functions/env.ts.
//
// Netlify only runs scheduled functions on its own on the published
// production deploy, but "Run now" in the Netlify UI also invokes them on
// deploy previews and branch deploys, which build from .env.dev.
export const PRODUCTION_DEPLOY_CONTEXT = "production";
const PRODUCTION_ENV_FILE = ".env.production";
const NON_PRODUCTION_ENV_FILE = ".env.dev";

function envFileForDeployContext(deployContext: string): string {
  if (deployContext === PRODUCTION_DEPLOY_CONTEXT) {
    return PRODUCTION_ENV_FILE;
  }
  return NON_PRODUCTION_ENV_FILE;
}

let loaded = false;

export function loadEnv(deployContext: string): void {
  if (loaded) {
    return;
  }
  // strict: a missing private key or unbundled file throws here instead of
  // injecting the raw `encrypted:...` ciphertext as each var's value, which
  // would surface later as a baffling invalid-DSN or 401 from /api/sync.
  dotenvx.config({
    path: envFileForDeployContext(deployContext),
    strict: true,
  });
  loaded = true;
}
