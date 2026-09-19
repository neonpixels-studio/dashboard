import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  future: { compatibilityVersion: 4 },
  modules: ["@pinia/nuxt"],
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
