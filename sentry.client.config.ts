import * as Sentry from "@sentry/nuxt";

Sentry.init({
  // DSN comes from runtimeConfig.public.sentry.dsn, baked at build from the
  // SENTRY_DSN dotenvx var (see nuxt.config.ts). Single source of truth.
  dsn: useRuntimeConfig().public.sentry.dsn,

  // Capture 10 % of traces in production; use 100 % locally for development.
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

  // Replay captures sessions on error at 100 % and 10 % of healthy sessions.
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],
});
