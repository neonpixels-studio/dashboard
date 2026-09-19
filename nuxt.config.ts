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
  },
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  nitro: {
    preset: "netlify",
  },
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: "Dashboard",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
    },
  },
});
