import * as Sentry from "@sentry/nuxt";

Sentry.init({
  // Sentry loads before useRuntimeConfig() is available, so the DSN must come
  // from process.env. nitro.replace (see nuxt.config.ts) bakes the build-time
  // SENTRY_DSN from the dotenvx files into this bundle, since dotenvx does not
  // run in the deployed function. Single source of truth: the dotenvx files.
  dsn: process.env.SENTRY_DSN,

  // Capture 10 % of traces in production; use 100 % locally for development.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
