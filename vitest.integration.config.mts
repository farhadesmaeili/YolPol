import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tooling/testing/server-only.mjs", import.meta.url)),
    },
  },
  test: {include: ["src/**/*.integration.test.ts"], fileParallelism: false, testTimeout: 20_000, hookTimeout: 30_000},
});
