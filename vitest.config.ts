import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "~": resolve(__dirname, "app"),
    },
  },
  test: {
    environment: "happy-dom",
    exclude: ["node_modules", "e2e"],
    setupFiles: ["./tests/setup.ts"],
  },
});
