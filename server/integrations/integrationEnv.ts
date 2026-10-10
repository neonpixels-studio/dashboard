const NUXT_ENV_PREFIX = "NUXT_";
const ENV_SEGMENT_SEPARATOR = "_";

// Nuxt's own runtimeConfig naming rule, in reverse: NUXT_STRIPE_SECRET_KEY is
// the env var that overrides runtimeConfig.stripeSecretKey.
export function runtimeConfigKeyFor(envVarName: string): string | null {
  if (!envVarName.startsWith(NUXT_ENV_PREFIX)) {
    return null;
  }
  const [first = "", ...rest] = envVarName
    .slice(NUXT_ENV_PREFIX.length)
    .toLowerCase()
    .split(ENV_SEGMENT_SEPARATOR);
  const capitalized = rest.map(
    (segment) => segment.charAt(0).toUpperCase() + segment.slice(1),
  );
  return [first, ...capitalized].join("");
}

function runtimeConfigValue(envVarName: string): string | undefined {
  const key = runtimeConfigKeyFor(envVarName);
  if (!key) {
    return undefined;
  }
  const value: unknown = useRuntimeConfig()[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Reads an integration env var by a name only known at runtime (a row's
 * `secret_ref`, or a per-slug `NUXT_*_<SLUG>` default).
 *
 * dotenvx only runs at build time, so on Netlify the deployed function's
 * `process.env` never holds these values. They do survive as the build-time
 * defaults nuxt.config.ts bakes into `runtimeConfig`, so fall back to the
 * matching runtimeConfig key. `process.env` wins when set, which keeps local
 * dev and tests (where dotenvx or the test populates it) unchanged.
 */
export function readIntegrationEnv(envVarName: string): string | undefined {
  const fromProcessEnv = process.env[envVarName];
  if (fromProcessEnv) {
    return fromProcessEnv;
  }
  return runtimeConfigValue(envVarName) || undefined;
}
