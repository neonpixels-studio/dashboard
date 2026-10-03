import { defineConfig, configDefaults } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "~": resolve(__dirname, "app"),
      "#shared": resolve(__dirname, "shared"),
      "#components": resolve(__dirname, "tests/support/nuxtComponentsStub.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    exclude: [...configDefaults.exclude, "e2e", ".netlify", ".nuxt", ".output"],
    setupFiles: ["./tests/setup.ts"],
  },
});
