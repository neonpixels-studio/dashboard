import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  future: { compatibilityVersion: 4 },
  modules: ["@pinia/nuxt", "@clerk/nuxt"],
  clerk: {
    // server/middleware/auth.ts registers clerkMiddleware() itself so it can
    // also resolve the database user onto the event context.
    skipServerMiddleware: true,
  },
  // Read process.env INLINE (not "") so dotenvx-decrypted values bake into the
  // server bundle at build time. Nitro only serializes these defaults; the
  // Netlify preset does not re-inject NUXT_* at function runtime, so a bare ""
  // default would resolve to empty in the deployed function.
  runtimeConfig: {
    databaseUrl: process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || "",
    disableSignups: process.env.NUXT_DISABLE_SIGNUPS || "",
    // Base64 AES-256-GCM key for server/utils/integrationSecrets.ts. Encrypts
    // per-app integration overrides before they're stored in the (future)
    // integration_config table; see .env.example for how to generate one.
    integrationEncryptionKey: process.env.NUXT_INTEGRATION_ENCRYPTION_KEY || "",
    // The Stripe provider's shared studio-wide secret key
    // (server/integrations/stripe). Not read via `useRuntimeConfig()`
    // anywhere — integration_config rows resolve it dynamically by
    // `secret_ref` (server/integrations/config.ts's resolveSecret, which
    // reads `process.env` directly since `secretRef` is a row-supplied key
    // name). This entry exists only so the Netlify preset forwards
    // NUXT_STRIPE_SECRET_KEY into the deployed function's process.env at
    // all; see resolveSecret's comment for why an env var absent from
    // runtimeConfig resolves fine locally but not once deployed.
    stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY || "",
    // Same reasoning as stripeSecretKey above, one per product-template app
    // (server/integrations/stripe/provider.ts's resolveProductIdsSource):
    // declared here purely so Netlify forwards each into the deployed
    // function's process.env, not read via useRuntimeConfig() anywhere.
    stripeProductIdBasin: process.env.NUXT_STRIPE_PRODUCT_ID_BASIN || "",
    stripeProductIdMarkpost: process.env.NUXT_STRIPE_PRODUCT_ID_MARKPOST || "",
    stripeProductIdWanderist:
      process.env.NUXT_STRIPE_PRODUCT_ID_WANDERIST || "",
    // Shared secret POST /api/sync (server/api/sync.post.ts) requires on the
    // Authorization: Bearer header — see server/utils/syncTrigger.ts. Read
    // via useRuntimeConfig() (not process.env directly) since, unlike
    // secretRef/stripeProductId* above, this is one static studio-wide value
    // rather than a row- or app-scoped key name, matching disableSignups'
    // pattern in server/utils/auth.ts.
    syncTriggerSecret: process.env.NUXT_SYNC_TRIGGER_SECRET || "",
    // The GA4 provider's shared studio-wide service account credentials
    // (server/integrations/ga4). Same reasoning as the Stripe entries above:
    // declared here purely so the Netlify preset forwards these into the
    // deployed function's process.env — the private key still resolves via
    // config.ts's resolveSecret (integration_config.secret_ref ->
    // process.env), and the client email via a plain process.env read in
    // server/integrations/ga4/provider.ts, neither via useRuntimeConfig().
    ga4ServiceAccountClientEmail: process.env.NUXT_GA4_SA_CLIENT_EMAIL || "",
    ga4ServiceAccountPrivateKey: process.env.NUXT_GA4_SA_PRIVATE_KEY || "",
    // One per property (server/integrations/ga4/provider.ts's
    // resolvePropertyId) — the deploy-time default; an integration_config
    // row's external_id overrides it per app, same precedent as Stripe's
    // product ids.
    ga4PropertyIdBasin: process.env.NUXT_GA4_PROPERTY_ID_BASIN || "",
    ga4PropertyIdMarkpost: process.env.NUXT_GA4_PROPERTY_ID_MARKPOST || "",
    ga4PropertyIdWanderist: process.env.NUXT_GA4_PROPERTY_ID_WANDERIST || "",
    ga4PropertyIdDanholloran:
      process.env.NUXT_GA4_PROPERTY_ID_DANHOLLORAN || "",
    ga4PropertyIdGrimicorn: process.env.NUXT_GA4_PROPERTY_ID_GRIMICORN || "",
    ga4PropertyIdNeonpixels: process.env.NUXT_GA4_PROPERTY_ID_NEONPIXELS || "",
    // The blog-syndication providers' shared studio-wide credentials
    // (server/integrations/syndication) — same reasoning as the Stripe/GA4
    // entries above: declared here purely so the Netlify preset forwards
    // these into the deployed function's process.env. There is only one
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
      ],
    },
  },
});
