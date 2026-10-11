import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  future: { compatibilityVersion: 4 },
  modules: ["@pinia/nuxt", "@clerk/nuxt", "@sentry/nuxt/module"],
  // Uploads readable stack traces for minified production errors; matches
  // basin/markpost/farflung's sibling config (see README's "Error
  // monitoring" section). @sentry/nuxt also reads these three directly from
  // process.env on its own, but they're spelled out here so it's obvious at
  // a glance which dotenvx vars back the source map upload.
  sourcemap: { client: "hidden" },
  sentry: {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: {
      // @sentry/nuxt only auto-deletes generated .map files after a
      // *successful* upload — confirmed by building with no real Sentry
      // credentials: the upload 404s and the client .map files are left
      // behind in dist/_nuxt/, which Netlify serves publicly (netlify.toml's
      // `publish = "dist"`). Deleting unconditionally here means a failed
      // upload (bad token, Sentry outage) never leaves readable source maps
      // in the public bundle, at the cost of also losing them locally on a
      // failed upload — acceptable, since dist/ is a build artifact, not a
      // source of truth.
      filesToDeleteAfterUpload: ["dist/**/*.map"],
    },
  },
  clerk: {
    // server/middleware/auth.ts registers clerkMiddleware() itself so it can
    // also resolve the database user onto the event context.
    skipServerMiddleware: true,
    // Baked in at build time for the same reason as runtimeConfig below: the
    // module defaults this to undefined and expects the env var at function
    // runtime, where dotenvx never ran.
    publishableKey: process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "",
  },
  // Read process.env INLINE (not "") so dotenvx-decrypted values bake into the
  // server bundle at build time. Nitro only serializes these defaults; the
  // Netlify preset does not re-inject NUXT_* at function runtime, so a bare ""
  // default would resolve to empty in the deployed function.
  runtimeConfig: {
    // @clerk/nuxt's own secret key slot, which the module defaults to
    // undefined; see the clerk.publishableKey comment above.
    clerk: {
      secretKey: process.env.NUXT_CLERK_SECRET_KEY || "",
    },
    databaseUrl: process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || "",
    disableSignups: process.env.NUXT_DISABLE_SIGNUPS || "",
    // Comma-separated Clerk user ids allowed to read dashboard data. Empty
    // means nobody is allowed (fails closed); see server/utils/auth.ts.
    ownerClerkUserIds: process.env.NUXT_OWNER_CLERK_USER_IDS || "",
    // Base64 AES-256-GCM key for server/utils/integrationSecrets.ts. Encrypts
    // per-app integration overrides before they're stored in the (future)
    // integration_config table; see .env.example for how to generate one.
    integrationEncryptionKey: process.env.NUXT_INTEGRATION_ENCRYPTION_KEY || "",
    // The Stripe provider's shared studio-wide secret key
    // (server/integrations/stripe). integration_config rows resolve it
    // dynamically by `secret_ref` through
    // server/integrations/integrationEnv.ts's readIntegrationEnv, which falls
    // back to this baked-in value because the deployed function's
    // process.env never holds it. Every integration key below follows Nuxt's
    // NUXT_FOO_BAR <-> fooBar naming so that fallback can find it.
    stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY || "",
    // Same reasoning as stripeSecretKey above, one per product-template app
    // (server/integrations/stripe/provider.ts's resolveProductIdsSource):
    // declared here purely so Netlify forwards each into the deployed
    // function's process.env, not read via useRuntimeConfig() anywhere.
    stripeProductIdBasin: process.env.NUXT_STRIPE_PRODUCT_ID_BASIN || "",
    stripeProductIdMarkpost: process.env.NUXT_STRIPE_PRODUCT_ID_MARKPOST || "",
    stripeProductIdFarflung: process.env.NUXT_STRIPE_PRODUCT_ID_FARFLUNG || "",
    // Shared secret POST /api/sync (server/api/sync.post.ts) requires on the
    // Authorization: Bearer header — see server/utils/syncTrigger.ts. Read
    // via useRuntimeConfig() (not process.env directly) since, unlike
    // secretRef/stripeProductId* above, this is one static studio-wide value
    // rather than a row- or app-scoped key name, matching disableSignups'
    // pattern in server/utils/auth.ts.
    syncTriggerSecret: process.env.NUXT_SYNC_TRIGGER_SECRET || "",
    hashnodeIngestSecret: process.env.NUXT_HASHNODE_INGEST_SECRET || "",
    // The GA4 provider's shared studio-wide service account credentials
    // (server/integrations/ga4). Same reasoning as the Stripe entries above:
    // declared here purely so the Netlify preset forwards these into the
    // deployed function's process.env — the private key still resolves via
    // config.ts's resolveSecret (integration_config.secret_ref ->
    // process.env), and the client email via a plain process.env read in
    // server/integrations/ga4/provider.ts, neither via useRuntimeConfig().
    ga4SaClientEmail: process.env.NUXT_GA4_SA_CLIENT_EMAIL || "",
    ga4SaPrivateKey: process.env.NUXT_GA4_SA_PRIVATE_KEY || "",
    // One per property (server/integrations/ga4/provider.ts's
    // resolvePropertyId) — the deploy-time default; an integration_config
    // row's external_id overrides it per app, same precedent as Stripe's
    // product ids.
    ga4PropertyIdBasin: process.env.NUXT_GA4_PROPERTY_ID_BASIN || "",
    ga4PropertyIdMarkpost: process.env.NUXT_GA4_PROPERTY_ID_MARKPOST || "",
    ga4PropertyIdFarflung: process.env.NUXT_GA4_PROPERTY_ID_FARFLUNG || "",
    ga4PropertyIdDanholloran:
      process.env.NUXT_GA4_PROPERTY_ID_DANHOLLORAN || "",
    ga4PropertyIdGrimicorn: process.env.NUXT_GA4_PROPERTY_ID_GRIMICORN || "",
    ga4PropertyIdNeonpixels: process.env.NUXT_GA4_PROPERTY_ID_NEONPIXELS || "",
    // The Sentry provider's shared studio-wide auth token + org slug
    // (server/integrations/sentry). Same reasoning as the Stripe/GA4 entries
    // above: declared here purely so the Netlify preset forwards these into
    // the deployed function (via readIntegrationEnv's runtimeConfig fallback) — the auth token still resolves
    // via config.ts's resolveSecret (integration_config.secret_ref ->
    // process.env), and the org slug via a plain process.env read in
    // server/integrations/sentry/provider.ts, neither via
    // useRuntimeConfig(). Scoped to the product-template apps (basin,
    // markpost, farflung) plus this dashboard itself (INTERNAL_APPS) —
    // grimicorn.dev and neonpixels.dev don't use Sentry, per issue #16.
    sentryAuthToken: process.env.NUXT_SENTRY_AUTH_TOKEN || "",
    sentryOrg: process.env.NUXT_SENTRY_ORG || "",
    // One per property (server/integrations/sentry/provider.ts's
    // resolveProjectSlug) — the deploy-time default; an integration_config
    // row's external_id overrides it per app, same precedent as Stripe's
    // product ids / GA4's property ids.
    sentryProjectBasin: process.env.NUXT_SENTRY_PROJECT_BASIN || "",
    sentryProjectMarkpost: process.env.NUXT_SENTRY_PROJECT_MARKPOST || "",
    sentryProjectFarflung: process.env.NUXT_SENTRY_PROJECT_FARFLUNG || "",
    sentryProjectDashboard: process.env.NUXT_SENTRY_PROJECT_DASHBOARD || "",
    // The Clerk provider's per-app secret keys
    // (server/integrations/clerk) — one per product-template app, each its
    // own Clerk instance (separate from this dashboard's own auth, configured
    // via the Clerk Nuxt module above). Same reasoning as the Stripe/GA4
    // entries above: declared here purely so the Netlify preset forwards
    // each into the deployed function (via readIntegrationEnv's runtimeConfig fallback); an integration_config
    // row's secret_ref still resolves the actual value
    // (server/integrations/config.ts's resolveSecret reads process.env
    // directly), not useRuntimeConfig().
    clerkSecretKeyBasin: process.env.NUXT_CLERK_SECRET_KEY_BASIN || "",
    clerkSecretKeyMarkpost: process.env.NUXT_CLERK_SECRET_KEY_MARKPOST || "",
    clerkSecretKeyFarflung: process.env.NUXT_CLERK_SECRET_KEY_FARFLUNG || "",
    // The blog-syndication providers' shared studio-wide credentials
    // (server/integrations/syndication) — same reasoning as the Stripe/GA4
    // entries above: declared here purely so the Netlify preset forwards
    // these into the deployed function (via readIntegrationEnv's runtimeConfig fallback). There is only one
    // writing-template app (danholloran; see app/config/apps.ts's
    // `template: "writing"`), so — unlike Stripe's per-app product ids or
    // GA4's per-property ids — none of these need a per-slug suffix.
    // hashnodeToken/devtoApiKey/mediumRapidapiKey still resolve via
    // config.ts's resolveSecret (integration_config.secret_ref ->
    // process.env), never via useRuntimeConfig(); hashnodePublicationId and
    // mediumUsername are public identifiers (not secrets) read via a plain
    // process.env lookup in each provider's own resolve*() function.
    hashnodeToken: process.env.NUXT_HASHNODE_TOKEN || "",
    hashnodePublicationId: process.env.NUXT_HASHNODE_PUBLICATION_ID || "",
    devtoApiKey: process.env.NUXT_DEVTO_API_KEY || "",
    mediumRapidapiKey: process.env.NUXT_MEDIUM_RAPIDAPI_KEY || "",
    mediumUsername: process.env.NUXT_MEDIUM_USERNAME || "",
    zyvopToken: process.env.NUXT_ZYVOP_TOKEN || "",
    // The GitHub provider's read-only fine-grained token
    // (server/integrations/github). Declared here so the deployed function
    // sees it: readIntegrationEnv falls back to this baked-in value, since
    // dotenvx only runs at build time. Unset means the GitHub section renders
    // "not configured" and the sync skips.
    githubToken: process.env.NUXT_GITHUB_TOKEN || "",
    public: {
      // Baked at build so sentry.client.config.ts can read it via
      // useRuntimeConfig().public.sentry.dsn. The DSN is not secret (it ships
      // to the browser). Single source of truth: SENTRY_DSN in the dotenvx
      // files — see README's "Error monitoring" section.
      sentry: {
        dsn: process.env.SENTRY_DSN || "",
      },
    },
  },
  // Self-hosted variable fonts, loaded before main.css so the @font-face rules
  // are registered before the type tokens that reference them. Each package
  // ships per-script woff2 files behind unicode-range, so an English page only
  // fetches the two latin files.
  css: [
    "@fontsource-variable/archivo",
    "@fontsource-variable/jetbrains-mono",
    "~/assets/css/main.css",
  ],
  devtools: { enabled: true },
  nitro: {
    preset: "netlify",
    // sentry.server.config.ts must read the DSN via process.env (Sentry loads
    // before useRuntimeConfig() is available), and dotenvx does NOT run in
    // the deployed function. Statically bake the build-time value into the
    // server bundle so SENTRY_DSN stays sourced only from the dotenvx files.
    replace: {
      "process.env.SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN || ""),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: "Neon Pixels Control",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#08080a" },
        { name: "apple-mobile-web-app-title", content: "Neon Pixels" },
      ],
      // Same icon set and cache-busting version as neonpixels.dev.
      link: [
        {
          rel: "icon",
          type: "image/png",
          href: "/images/favicon-96x96.png?v=20260808",
          sizes: "96x96",
        },
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "/images/favicon.svg?v=20260808",
        },
        { rel: "shortcut icon", href: "/images/favicon.ico?v=20260808" },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/images/apple-touch-icon.png?v=20260808",
        },
        { rel: "manifest", href: "/images/site.webmanifest?v=20260808" },
      ],
    },
  },
});
